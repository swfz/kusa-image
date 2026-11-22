# Spike Notes: migrate-to-cloudflare-workers

スパイクの記録。結果は `openspec/changes/migrate-to-cloudflare-workers/design.md` に反映する。このディレクトリは使い捨てで、本実装には流用しない。

## 1.1 fixtures

- `spike/scripts/fetch-fixtures.sh` で取得した（2026-11-22、swfz）
- 取得したもの: `default.json`（直近1年）、`year-2008.json`〜`year-2026.json`（暦年）、`not-found.json`（存在しないユーザー、`errors[0].type = NOT_FOUND`）
- `halloween-synthetic.json` は合成データ。`isHalloween` は対象期間ではなく**リクエストした時点**で決まるため、11月には実データが取れない。`default.json` の `isHalloween` を true に書き換えて作った
- swfz の 2008〜2012 年は 0 件。19 年分の画像では、上の 5 行がすべて `NONE` のマスになる
- GraphQL の cost は 1 回あたり 1

## 1.2 基準画像

- 2026-11-22 に `kusa-image.swfz.deno.net/swfz` から取得した: `light.png` / `dark.png` / `past3.png` / `past19.png`
- すべて 8-bit RGBA。サイズはそれぞれ 7.9KB / 7.7KB / 22KB / 138KB
- 応答時間（Deno 上、キャッシュの状態は不明）: light 2.1s、dark 1.3s、past3 2.8s、**past19 10.1s**
  - 今の Deno 版でも 19 年分はかなり重い（CanvasKit での描画と、GitHub API への 19 回の逐次リクエストの合計）

## 1.3 フォント

- 今の画像は、`deno.land/x/canvas@v1.4.2`（CanvasKit）の Canvas2D エミュレーションの既定値 **`"10px monospace"`** で描かれている
  - 根拠: `src/lib.js` に `"10px monospace"` がある。`renderCanvas.ts` は `ctx.font` を設定していない
- CanvasKit の wasm に埋め込まれている唯一のフォントは **Noto Mono Regular**（Droid Sans Mono 系、Copyright 2007 Google）
- 入手先は Skia の `modules/canvaskit/fonts/NotoMono-Regular.ttf`（107,848 バイト。wasm に埋め込まれたものとサイズが一致する）。`spike/assets/NotoMono-Regular.ttf` に保存した
  - wasm から直接切り出したものは、データセグメントが分かれているせいで壊れていた。そのため使わない
- 再現できるかの確認: Pillow（FreeType）で、canvas の `fillText` と同じくベースラインを基準に、同じ位置に 10px で描いた（`spike/assets/compare-text-1.3.png`、上が今の画像、下が再現したもの）
  - 字形と位置は一致した
  - 平均絶対差は 5〜10/255 で、再現した方がやや濃い。ヒンティングやガンマの違いによるもの。濃淡はタスク 3.x で調整する
- ライセンス: 本実装でフォントを同梱するときに、ライセンスの種類を確認し、ライセンス文を添付する

## 2.1 cf の導入

- `cf` の公開状況（2026-11-22）: latest は `1.0.0-rc.2`（11-19）。rc.0〜rc.2 はどれも公開から7日以内のため、cooldown（7日）の下では入れられない。cooldown の条件を満たす最新版は **`1.0.0-beta.32`（11-13）**
  - ほぼ毎日リリースされているので、cooldown を設けると常に約1週間遅れの版を使うことになる
  - engines は `node ^22.23.0 || ^24.22.0 || ^26.12.0`。ローカルは Node 26.13.1
- `cf init workers <dir> --package-manager pnpm --no-install` で雛形を作った（`spike/worker/`）
  - 生成されたファイル: `cloudflare.config.ts`（`defineConfig` と `bindings`。エントリポイントは `import ... with { type: "cf-worker" }`）、`vite.config.ts`（`@cloudflare/vite-plugin`）、`src/index.ts`、`tsconfig.json`、`pnpm-workspace.yaml`（`allowBuilds: esbuild, workerd`）
  - **beta.32 では `test/` と `vitest.config.ts` は生成されない**。最新のドキュメントには生成されると書かれているので、新しい版で追加された機能と思われる。タスク 2.2 に影響する
  - devDependencies が `"@cloudflare/vite-plugin": "beta"` のように dist-tag で指定されるので、cooldown がないと公開直後の版を拾う
- **重要な発見: pnpm 12 はグローバルの cooldown 設定を読んでいない**
  - `~/Library/Preferences/pnpm/rc` に `minimum-release-age=10080` が書かれているが、pnpm 12.4.0 の `pnpm config list` には出てこない
  - 実際に、公開から2日の `miniflare 5.20261119.0-beta` などが入った
  - プロジェクトの `pnpm-workspace.yaml` に `minimumReleaseAge: 10080` を書くと効いた。入れ直した結果、132 パッケージすべてが公開から7日以上経ったものになった（registry の公開時刻で確認）
  - 他のプロジェクトにも影響するので、グローバルの設定の書き方（pnpm 12 での置き場所）を swfz に確認してもらう必要がある
- `cf dev --port 8787` が起動し、`curl http://localhost:8787/` で `Hello World!` が返ることを確認した
  - ローカルの Explorer API（`/cdn-cgi/local/explorer/api`）から D1 / KV / トレースを参照できる

## 2.2 ユニットテスト

- `vitest@4.1.12` と `@cloudflare/vitest-plugin@1.8.2` を cooldown の下で入れた
- `vitest.config.ts` に `cloudflareTest({ config: true })` と書くだけで、`cloudflare.config.ts` の Worker とバインディングを読み込んで、workerd 上でテストが動く（Wrangler の設定ファイルは不要）
- テストは `import { exports } from "cloudflare:workers"` の `exports.default.fetch()` で Worker を呼ぶ。GitHub API は `vi.spyOn(globalThis, "fetch")` でモックし、fixtures の JSON を返す
- **注意点**: モックの Response は `mockImplementation(async () => Response.json(...))` のように、呼ばれるたびに作る必要がある。`mockResolvedValue(Response.json(...))` だと、テスト側で作った Response を Worker 側で読むことになり、`Cannot perform I/O on behalf of a different request` で失敗する
- `pnpm test` で2件（200 で合計値を返す / 存在しないユーザーは 404）が通った（`spike/worker/test/index.test.ts`）

## 2.3 VRT（Playwright）

- `@playwright/test@1.65.1` を cooldown の下で入れた。chromium-headless-shell を使った
- `playwright.config.ts` の `webServer` で2つのプロセスを起動する
  - GitHub GraphQL のモック（`vrt/mock-github.mjs`、port 8000、`variables.user` に応じて fixtures を返す）
  - `cf dev --port 8787`
- 接続先の切り替え: `cloudflare.config.ts` は TypeScript のモジュールなので、`bindings.text(process.env.GITHUB_API_URL ?? "https://api.github.com/graphql")` のように環境変数で上書きできる。webServer の `env` で渡す
  - `GITHUB_API_URL=http://localhost:9`（接続できない URL）で起動すると 500 になったので、環境変数の値が実際に使われていることを確認した
- `toHaveScreenshot` のテスト（swfz）とテキストの検証（存在しないユーザー）の2件が、スナップショットを作った後の2回目の実行でも通った（`spike/worker/vrt/image.spec.ts`）
- 本実装では、旧リポジトリの VRT（json-server と3つのブラウザ）と同じ構成を、`cf dev` を相手にほぼそのまま移せる見込み

## 2.4 Cloudflare へのデプロイ

- ゾーンは `swfz.dev` の1つだけ。既存サービスは `article-search.swfz.dev` などの `<サービス名>.swfz.dev`（Pages への CNAME）。スパイク用は **`kusa-image-spike.swfz.dev`** にした。本番は `kusa-image.swfz.dev` を想定する
- `cloudflare.config.ts` に `domains: ["kusa-image-spike.swfz.dev"]`、`bindings.d1({ name })`、`bindings.secret()`、`observability: { enabled: true }` を書いた
- **Secret**: Worker がまだ存在しない状態では `cf workers secrets update` が使えない。初回は `cf deploy --secrets-file <file>`（`NAME=value` 形式）で渡す必要がある。2回目以降は update でよい
- **D1**: `cf deploy` が、ID のない D1 バインディングを名前で自動作成した（ID を config に書き戻すことはしない）。マイグレーションは `cf d1 migrations apply <DB の UUID>` で流した。`./migrations/*.sql` を順に適用する。非対話の環境では確認プロンプトに自動で yes と答える
- **カスタムドメイン**: デプロイ直後の数十秒は `error code: 1104` が返り、その後に応答が返るようになった
- 確認した結果:
  - `/secret` は `{"secretSet":true}`
  - `/d1` は呼ぶたびに `count` が 1 → 2 と増えた（INSERT と SELECT ができた）
  - `/cache` は1回目が MISS、2回目以降は `cf-cache-status: HIT`・`age` が増え、生成時刻も同じだった → **カスタムドメインで Cache API が効く**
  - `/swfz` は 1101。トークンなしで GitHub API を呼んで 401 が返り、スパイク用のコードがそれを処理していないため。2.4 の確認項目には含まれない

## 3.1 文字マスクの生成

- `spike/scripts/build-glyphs.py`（Pillow/FreeType）で、Noto Mono 10px の文字ごとのアルファマスクを `spike/worker/src/render/glyphs.generated.ts` に出力した
- 対象は描画で使う 36 文字（数字・サマリー文・月名・曜日・凡例・期間表記の記号）。サブピクセルの位相は 4 つ
- マスクの合計は 8,127 バイト。base64 にして TS モジュールにすると **18KB**（「数十KB以下」を満たす）
- Noto Mono 10px の送り幅は **ちょうど 6.0px**。今のレイアウトは文字の描き始めの座標が整数なので、実際に使う位相は 0 だけになる

## 3.2 案B の描画

- 実装: `spike/worker/src/render/render.ts`（描画）と `png.ts`（indexed PNG エンコーダ。CRC32 は自前、deflate は `CompressionStream("deflate")`。"deflate" は zlib 形式なので IDAT にそのまま使える）
  - パレット: 背景・マス 5 色・文字の濃淡 16 段 = 22 色
  - 座標: 旧 `renderCanvas.ts` と同じ（文字はベースライン基準、マスは 12px 間隔で 10px 角）
- 出力: `spike/compare/b-{light,dark,halloween,past3,past19}.png`。どれも `8-bit colormap` の PNG で、寸法は 670x140 / 670x420 / 670x2660。Pillow でも開けた
- サイズ: 1 年分 2.5KB（今は 7.9KB）、19 年分 41KB（今は 138KB）。**約 1/3**
- 基準画像との差分（`spike/scripts/diff.py`）:
  - **マスの色と位置は完全に一致**。違うのは文字の画素だけ（全体の約 2.2〜2.5%）
  - 文字の濃さを合わせるために、テーマごとにアルファにガンマをかけた。Skia は明るい背景の文字を細く、暗い背景の文字を太く描くので、ライト 1.6・ダーク 0.45 で差分が最小になった
  - その結果、どの画像も差が 64/255 を超える画素は 0 個。平均差はライト 0.30、ダーク 0.10、19 年分 0.26
- Node 26（Apple Silicon）での処理時間:
  - 1 年分は約 0.7〜1.0ms
  - 19 年分は実時間 6.3ms、プロセスの CPU 時間 8.0ms（50 回の平均）。そのうち deflate（約 1.8MB）が約 2.3ms
  - Workers の Free の 10ms に対して余裕が少ない。実際の値は 3.4 で計測する

## 3.4 Workers Free での CPU 計測（案B）

- このアカウントのサブスクリプションは `R2 Paid` と `Teams Free Base` だけで、**Workers は Free プラン**
- 計測方法: `kusa-image-spike.swfz.dev/render?years=N` に、fixtures（文字列で同梱し、リクエストのたびに `JSON.parse`）から描画した PNG を返させた。`cache-control: no-store` で、キャッシュは使っていない。CPU 時間は Workers Observability の `$workers.cpuTimeMs` を `cf o11y telemetry query` で取得した。取り込みには数分の遅延がある
- デプロイ先の出力は、ローカルで生成した PNG とバイト単位で一致した
- 結果（各 25〜26 回）:

| リクエスト | CPU の中央値 | 最大 | 結果 |
|---|---|---|---|
| 1 年分（全体） | 2.5ms | 7ms | すべて ok |
| 19 年分: JSON.parse まで | 2ms | 6ms | すべて ok |
| 19 年分: 描画まで（エンコードなし） | 17ms | 46ms | すべて ok |
| 19 年分: 全体 | **32.5ms** | **65ms** | すべて ok |

- **1 年分は 10ms に収まる。19 年分は収まらない**。描画とエンコード（約 1.8MB を deflate）がそれぞれ約 15ms かかる
- Node（ウォームアップ済み）の約 4 倍遅い。リクエストが多数のマシンや isolate に分散し、JIT が温まる前のコードで動くためと考えられる
- **10ms を超えても 1102 にはならなかった**（19 年分の 76 件すべて ok）。Free プランの CPU 上限の適用は厳密ではないらしいが、ドキュメント上は上限を超えたら 1102 なので、これを前提に設計してはいけない

## 3.5 案A（SVG → resvg-wasm）

- 3.4 で 19 年分が 10ms に収まらなかったので、条件に当てはまり実施した
- `@resvg/resvg-wasm@2.6.2`（wasm 2.4MB）と Noto Mono（`.bin` として同梱）を使い、旧レイアウトと同じ座標の SVG を描いた（`spike/worker/src/render/svg.ts`）
  - Worker 全体のアップロードサイズ: 3,384KiB、gzip 後 1,057KiB（案B だけなら gzip 後 47KiB）。Free の上限 3MB には収まる
- 出力: `spike/compare/a-*.png`（8-bit RGBA）。1 年分 10.8KB、19 年分 180KB で、今の画像より大きい
- 基準画像との差分: 差のある画素は 2.5〜2.9%（案B と同程度）。ただし**差が 64/255 を超える画素がライトで 448、ダークで 846、19 年分で 7,124 ある**（案B はすべて 0）。マスの縁のアンチエイリアスや文字の描き方が Skia と違うため
- CPU 時間（Workers Free、各 25 回）:

| リクエスト | 案A の中央値 | 案A の最大 | 案B の中央値（参考） |
|---|---|---|---|
| 1 年分 | **11ms** | 143ms | 2.5ms |
| 19 年分 | **192ms** | 800ms | 32.5ms |

- **案A は CPU 時間でも見た目の再現性でも案B に劣る**。1 年分でも中央値で 10ms を超える
- 800ms でも 1102 にならなかった。Free の CPU 上限は、少なくとも今回の規模では厳密に適用されていない

## 3.3 見た目の判断

- `spike/compare/review-B-vs-now.png`（今の画像と案B、ライト/ダーク、2 倍に拡大）と `spike/compare/side-by-side-b-*.png` を swfz が確認し、**合格**（2026-11-22）

## 3.6 描画方式の決定

- **案B（自前でラスタライズする indexed PNG）に決定**。CPU 時間でも見た目でも案A より優れていて、見た目は swfz の確認で合格した
- 19 年分が Free の 10ms に収まらない件は、swfz の判断で **選択肢 A: Free で始めて、CPU 上限の超過をログで監視する** にした（Paid にはしない、描画も分割しない）

## 5.3 後片付け

- Worker `kusa-image-spike`（`cf workers delete --force`）と D1 `kusa-image-spike`（`cf d1 delete --force`）を削除した
- 確認: `cf workers list`・`cf d1 list`・`swfz.dev` の DNS レコードのどれにも spike 関連のものは残っていない。`kusa-image-spike.swfz.dev` は名前解決できない
- Workers Observability に残った計測時のイベントは、保持期間が過ぎれば消える
