# Design

## Context

- 移行元は `swfz/deno-kusa-image`。Deno 上で `deno.land/x/canvas`（CanvasKit/wasm）を使って描画し、`caches.open()` で過去年の GitHub API 応答をキャッシュし、Deno KV にログを残している
- ログは `swfz/deno-logviewer-import-dataform` の GH Actions で KV → GCS → BigQuery（`kusa_image.logs`）→ Dataform に流れている
- アクセスは月 800〜1,000 件程度。量の制約はなく、効いてくる制約は Workers Free の **CPU 10ms/リクエスト** だけ
- `past_years` には 12〜13 年分の利用実績がある（ほぼ swfz 本人）。spec の上限は 19 年分（670x2660px）
- 期限は Deno Deploy の終了（2027年4月、日付は未公表）。新サービスは 2027-01 中に公開するのが目標
- スパイク（2026-11-22）の記録は `spike/NOTES.md`。スパイクのコードは使い捨てで、本実装には流用しない（考え方と定数は引き継ぐ）

動機と対象範囲は proposal.md、振る舞いは specs/ を参照。

## Goals / Non-Goals

**Goals:**
- 普段使う 1 年分の画像は、Free の CPU 10ms に余裕を持って収まること
- 19 年分まで描画でき、CPU 上限を超えたかどうかを監視できること
- 描画を「GitHub API の応答 → PNG のバイト列」という純粋な関数にして、ユニットテストと VRT の両方で検証できること
- Paid に上げるときに、コードを変更しないで済むこと

**Non-Goals:**
- GitHub 以外のデータソース
- SVG での出力
- 新しい見た目やテーマの追加（今の見た目を再現するところまで）
- GitHub App による認証（再検討する条件は Decisions の「GitHub の認証方式」）

## Decisions

**ランタイムは Cloudflare Workers の Free プラン。19 年分の CPU 超過は許容して監視する**
- スパイクの計測（案B、キャッシュなし、Workers Free）:
  - 1 年分: CPU の中央値 2.5ms、最大 7ms
  - 19 年分: 中央値 32.5ms、最大 65ms
- 1 年分は収まる。19 年分は収まらない。ただし計測では 800ms でも 1102 にはならず、上限の適用は厳密ではなかった
- 決定（swfz の判断）: Free で始める。19 年分はたまにしか使われないので、超過を許容する。CPU 上限の超過で 1102 になったリクエストは Worker 自身ではログを残せない。そのため Workers Observability の outcome（`exceededCpu`）で監視する。実際に 1102 が出るようになったら Paid に上げる（コードは変えない）
- 代替案:
  - 最初から Paid: 不要な固定費になる
  - 描画を分割・最適化する: 4bit パレットにするなどしても、10ms には届かない見込み

**描画方式は自前のラスタライズで indexed PNG を出力する（スパイクの案B）**
- 構成:
  - パレット: 背景・マス 5 色・文字の濃淡 16 段 = 22 色。テーマとハロウィンの違いはパレットだけで表す
  - 矩形は、パレットのインデックスのバッファ（1px = 1 バイト）に直接書く。座標は旧 `renderCanvas.ts` と同じ
  - 文字は Noto Mono Regular 10px（旧版の CanvasKit の既定のフォント）のアルファマスクを使う。マスクはビルド時に生成し、TS モジュールとして同梱する（約 18KB）。文字の描き始めはベースライン基準で、送り幅は 6.0px
  - 文字の濃さは、Skia のコントラスト補正に合わせて、テーマごとにアルファにガンマをかける（ライト 1.6、ダーク 0.45）
  - PNG は color type 3 で出力する。CRC32 は自前で計算し、deflate は `CompressionStream("deflate")` に任せる
- スパイクの結果:
  - マスの色と位置は今の画像と完全に一致した
  - 文字の画素の差は最大でも 64/255 未満。見た目は swfz の確認で合格した
  - PNG のサイズは今の約 1/3（1 年分 2.5KB）
- 代替案: SVG → resvg-wasm（案A）。1 年分でも CPU の中央値 11ms、19 年分は 192ms かかり、見た目の差も大きかった。wasm で gzip 後 1MB 増える

**CLI は `cf`、テストは vitest と Playwright**
- `cloudflare.config.ts` で Worker、バインディング、`domains`、`observability` を定義する。テストや VRT で接続先を切り替えるときは、`process.env` から読む
- ユニットテスト: `@cloudflare/vitest-plugin` の `cloudflareTest({ config: true })` を使い、`test/` だけを対象にする
  - GitHub API は `vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(...))` でモックする
  - Response はモックが呼ばれるたびに作る必要がある（Workers の I/O 制約のため）
- VRT: Playwright の `webServer` で、GitHub のモック（fixtures を返す）と `cf dev` を起動する。旧リポジトリの VRT と同じテストケースを移す
- D1 は `cf deploy` が名前から自動で作る。マイグレーションは `cf d1 migrations apply`。Secret の初回登録は `cf deploy --secrets-file` で、2回目以降は `cf workers secrets update`
- 採用理由: Wrangler は `cf` の open beta が終わった後に非推奨になる。代替案の Wrangler は、後で移行する作業が必要になる
- 運用上の注意:
  - cooldown はプロジェクトの `pnpm-workspace.yaml` に `minimumReleaseAge: 10080` と書く。pnpm 12 はグローバルの rc の設定を読まない
  - `cf` などは exact で固定する（スパイクでは `1.0.0-beta.32`。1.0 の正式版が出て cooldown を過ぎたら上げる）

**ホストは `kusa-image.swfz.dev`（既存ゾーン `swfz.dev` のサブドメイン）**
- 既存サービスの運用（`<サービス名>.swfz.dev`）に合わせた
- 代替案は `*.workers.dev`。Cache API が効かず、URL が基盤に縛られるので採らなかった
- スパイクで、カスタムドメインの上で Cache API が HIT することを確認した。デプロイ直後の数十秒は 1104 が返る

**画像キャッシュは Cache API（`caches.default`）**
- 代替案: KV。Free だと書き込みが 1,000 件/日で、上限に達するおそれがある
- 過去年の GitHub API 応答も、年ごとに Cache API で保持する（spec の `image-cache`）
- キャッシュに当たれば描画しないので、19 年分の CPU 超過は初回の描画だけで起きる

**ログは D1 に1リクエスト1行で保存する（`id`・`ts`・`value` は JSON 文字列）**
- 代替案:
  - Analytics Engine: スキーマを平らにする必要があり、Dataform も直す必要がある
  - BigQuery へ直接書き込む: JWT 署名の CPU コストがかかる
- 採用理由: `id/ts/value(JSON)` の形で、項目を増やしても D1 と BigQuery のスキーマを変えずに済む
- 書き込みは `ctx.waitUntil` で応答の後に回す。90 日を超えたレコードは定期的に削除する（Cron Trigger）

**BigQuery への取り込みは、旧サービスと分ける**（swfz の判断）
- 新しいプライベートリポジトリ `swfz/cloudflare-import-dataform` で、D1 → GCS → BigQuery（`kusa_image.cf_logs`、`id:STRING, ts:TIMESTAMP, value:JSON`）→ Dataform に流す
- 旧サービスのログ（Deno KV → `swfz/deno-logviewer-import-dataform` → `kusa_image.logs`）は、Deno の終了までそのまま動かす
- 理由:
  - 移行期間は、旧 URL と新 URL の両方にリクエストが来る。テーブルを分けておけば、どちらのサービスへのリクエストかを列で見分けずに済む
  - KV のキーを真似た `key` と、常に null の `versionstamp` を持たずに済む
  - リポジトリ名の慣例（`<データの出どころ>-import-dataform`）に合う。terminal-image と obsidian-opener を Cloudflare に移したときも同じリポジトリに足せる
- 代替案: 既存のワークフローに matrix のエントリを足し、`kusa_image.logs` に混ぜる。作業は少ないが、上の二重計上とリポジトリ名の問題が残るので採らなかった
- 新旧を通して見たいときは、Dataform で2つのテーブルを UNION する
- 旧リポジトリは、Deno の終了とともにアーカイブする（リネームはしない）

**GitHub の認証は個人の PAT（今と同じ）**（swfz の判断）
- 今回の移行では GitHub App を作らない。旧サービスと同じく、個人の PAT を Secret として持たせる
- 見送った理由: 移行期限までに移行を終えることを優先した。App にすると、App の作成、秘密鍵の管理、Worker の中でのトークン発行という作業とリスクが増える。そのわりに、今のアクセス量（GraphQL は 1 回あたり cost 1、月 1,000 件弱）では枠を食い合う問題が表に出ていない
- 残る問題: レートリミットの枠は swfz の他の作業と共有になる。ログの `cost` でこのサービスの消費量を集計する
- 再検討する条件: このサービスの `cost` の合計が枠の大きな割合を占めるようになった場合、または他の作業との食い合いで 503（`rate_limited`）が出た場合。そのときは GitHub App か、マシンユーザー用アカウントの PAT を検証する

**Deno 側の移行は Phase 0〜3 で段階的に進める**（proposal.md 参照）
- Phase 2 の案内入り画像は、旧リポジトリの今のコードに1行描き足すだけで実装する。新しい描画方式には依存させない

## Risks / Trade-offs

- **[Risk] 19 年分の初回描画が Free の CPU 上限を超えて 1102 になる** → キャッシュに当たれば描画しない。Workers Observability の `exceededCpu` を監視し、実際に出るようになったら Paid に上げる
- **[Risk] `cf` が 1.0 前のため、破壊的な変更や不具合がある** → 版を exact で固定する。だめなら Wrangler に戻せる
- **[Risk] 個人の PAT のレートリミットを他の作業と食い合う** → ログの `cost` で監視し、再検討する条件に当てはまったら GitHub App に切り替える
- **[Risk] 文字マスクを作り直したときに見た目がずれる** → マスクは生成物としてリポジトリに入れ、VRT で検出する
- **[Trade-off] ログを D1 に入れると、集計の負荷を BigQuery 側に寄せることになる** → 分析は今も BigQuery で行っているので問題にならない
- **[Risk] Deno の終了日が未公表なので、4月の初めに止まる可能性がある** → 最悪のケースとして 2027-04-01 を前提にスケジュールを組む（Phase 2 は 2027-02-01 開始）

## Migration Plan

1. 本実装を進め、`kusa-image.swfz.dev` で公開する（Phase 0、2027-01 中）
2. `swfz/cloudflare-import-dataform` を作り、D1 のログを `kusa_image.cf_logs` に取り込む
3. （Phase 1 の 301 リダイレクトは実施しない。理由は proposal.md）
4. 旧リポジトリに案内入り画像をデプロイする（Phase 2、2027-02-01 から）
5. Deno Deploy の終了とともに、旧リポジトリと KV 側の取り込みを止めてアーカイブする（Phase 3）

ロールバック: Phase 2 の案内入り画像は、Deno 側に前の版を再デプロイすれば戻せる（Deno が終了するまで）。新サービス側の不具合は、Cloudflare の前の版にロールバックする。
