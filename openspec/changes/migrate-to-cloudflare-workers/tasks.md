# Tasks

本実装のタスクは、スパイクで design.md の「スパイクで確定する判断」が確定した後に、このファイルへ追記する。スパイクのコードは `spike/` の下に置く使い捨てのもので、本実装には流用しない。

## 1. スパイクの準備

- [x] 1.1 swfz の GitHub API 応答を、デフォルト期間・2008〜今年の各暦年・Halloween を含む期間について `spike/fixtures/` に JSON で保存する。期間の数だけファイルがあり、各ファイルに `contributionCalendar` が入っていることを確認する
- [x] 1.2 今の画像の基準画像（ライト / ダーク / `past_years=3` / `past_years=19`）を、稼働中の `kusa-image.swfz.deno.net` から `spike/baseline/` に保存する。4枚の PNG があることを確認する
- [x] 1.3 今の画像に使われているフォント（`deno.land/x/canvas@v1.4.2` のデフォルトのフォントと、そのサイズ）を特定し、`spike/NOTES.md` に記録する。フォントのファイルが手元で入手できることを確認する

## 2. スパイク: CLI

- [x] 2.1 pnpm（cooldown 設定込み）で `cf` を導入し、`cloudflare.config.ts` の最小の Worker を `cf dev` で起動する。インストールが cooldown に阻まれないこと、`curl` で応答が返ることを確認する
- [x] 2.2 1.1 の fixtures を返すモック GitHub API を相手に、vitest-pool-workers（または `cf` が推奨するテスト手段）で Worker のユニットテストを1件書き、`pnpm test` で通ることを確認する
- [x] 2.3 `cf dev` で起動した Worker を相手に、Playwright の `toHaveScreenshot` のテストを1件書き、通ることを確認する
- [x] 2.4 `cf` で D1 の作成とマイグレーション、Secret の登録、既存ゾーンのサブドメイン（スパイク用）へのデプロイができ、デプロイ先で Cache API が効くこと（2回目のリクエストで `cf-cache-status` などからヒットがわかること）を確認する
- [x] 2.5 2.1〜2.4 の結果から `cf` と Wrangler のどちらにするかを決め、design.md の「2. CLI」を確定させる

## 3. スパイク: 描画方式

- [x] 3.1 1.3 のフォントから、必要な文字（数字・英字・記号・空白）を 10px でラスタライズしたアルファマスクを作るビルドスクリプトを書く。出力ファイルのサイズが数十KB 以下であることを確認する
- [x] 3.2 案B（パレットのバッファに直接描き、indexed PNG を `CompressionStream` で出力する）で、1.1 の fixtures から 1 年分と 19 年分を描画する。出力した PNG が一般的なビューアーで開け、寸法が 670x140 と 670x2660 であることを確認する
- [x] 3.3 3.2 の出力と 1.2 の基準画像を並べた比較画像（ライト / ダーク / 複数年）を `spike/compare/` に作り、swfz に見た目を確認してもらう。合否を `spike/NOTES.md` に記録する
- [x] 3.4 案B の Worker を Free プランの Workers にデプロイし、キャッシュを効かせずに 1 年分と 19 年分をそれぞれ 20 回以上リクエストする。Workers Logs の CPU 時間（中央値と最大値）と、1102 エラーの有無を `spike/NOTES.md` に記録する
- [x] 3.5 3.3 が不合格のとき、または 3.4 で 10ms に収まらないときに限り、案A（SVG → resvg-wasm）で同じ計測と比較画像を作り、`spike/NOTES.md` に記録する。条件に当てはまらずに省略した場合は、その旨を記録する
- [x] 3.6 3.3〜3.5 の結果から描画方式（と、必要なら Paid にするか描画を分割するか）を決め、design.md の「1. 描画方式」を確定させる

## 4. スパイク: GitHub の認証方式

GitHub App の検証（App の作成、PAT との取得結果の比較、Worker の中でのトークン発行の CPU 計測）は、swfz の判断（2026-11-22）で取りやめた。今回の移行では個人の PAT を使い続ける。

- [x] 4.1 認証方式を個人の PAT に決め、GitHub App は見送った理由と再検討する条件を design.md の「3. GitHub の認証方式」に書く。`openspec validate migrate-to-cloudflare-workers --strict` が通ることを確認する

## 5. スパイクの締め

- [x] 5.1 design.md の「スパイクで確定する判断」をすべて「確定していること」へ移し、`openspec validate migrate-to-cloudflare-workers --strict` が通ることを確認する
- [x] 5.2 確定した設計に基づいて、本実装のタスク（描画・GitHub クライアント・キャッシュ・ログ・トップページ・テスト・VRT・デプロイ・BigQuery の取り込み・旧リポジトリでの Phase 1〜2）をこのファイルに追記し、`openspec status --change migrate-to-cloudflare-workers` で tasks が認識されることを確認する
- [x] 5.3 スパイク用にデプロイした Worker・D1・サブドメインを削除し、Cloudflare のダッシュボードに残っていないことを確認する

## 6. 本実装: プロジェクトの土台

- [x] 6.1 リポジトリ直下に Workers プロジェクトを作る（`cf init` 相当の構成に、`package.json` の `"type": "module"`、`tsconfig.json` の `strict: true` を加える）。`pnpm-workspace.yaml` に `minimumReleaseAge: 10080` と `allowBuilds` を書き、`cf`・vite・vitest・Playwright を exact で固定する。`pnpm install` の後に、入ったパッケージがすべて公開から 7 日以上経っていることを registry の公開時刻で確認する
- [x] 6.2 Prettier（`singleQuote`・`trailingComma: all`・`printWidth: 120`）、oxlint（typescript-eslint が TS 7 に未対応のため ESLint から変更）、型チェックのスクリプト（`format:check`・`lint`・`typecheck`・`test`・`test:vrt`）を用意し、空の状態ですべて成功することを確認する
- [x] 6.3 GitHub Actions の CI（format・lint（oxlint）・typecheck・test・VRT）を追加し、ブランチへの push で全ジョブが緑になることを確認する

## 7. 本実装: 描画（spec: contribution-image）

- [x] 7.1 文字マスクの生成スクリプトと生成物（Noto Mono Regular 10px、必要な文字だけ）をリポジトリに入れる。フォントのライセンスを確認し、ライセンス文を同梱する。生成物の再生成で差分が出ないことを確認する
- [x] 7.2 indexed PNG エンコーダを実装する。テストでは、出力を `DecompressionStream` で展開してヘッダー・パレット・画素が入力と一致すること、CRC が正しいことを確認する
- [x] 7.3 描画を実装する（パレット 22 色、旧座標、ガンマ ライト 1.6 / ダーク 0.45）。テストで次を確認する: 寸法（1 年分・複数年）、指定した座標のマスの色（レベル別、ライト/ダーク、ハロウィン）、サマリー文の形式（デフォルト・`to`・年）、月ラベルの位置、複数年の並び順（古い年が上）

## 8. 本実装: GitHub クライアント（spec: contribution-image, access-logging）

- [x] 8.1 GraphQL クライアントを実装する（PAT は Secret、接続先はバインディングで切り替え）。テストで次を確認する: 存在しないユーザー → `user_not_found`、レートリミット → `rate_limited`、5xx や通信失敗 → `upstream_error` に分類されること、`rateLimit` の `cost`・残量・リセット時刻を取り出せること

## 9. 本実装: リクエスト処理（spec: contribution-image）

- [x] 9.1 パラメータの解釈を実装する: パス優先の `user`、`theme`、`to`（不正なら 400）、`past_years`（解釈できない値は 1、上限は今年 − 2008 + 1 で補正、指定時は `to` を無視）。spec の各シナリオをユニットテストにして通す
- [x] 9.2 ルーティングを実装する: トップページ（旧 `public/index.html` を新しい URL に合わせて移植）、`/robots.txt`、`/favicon.ico`、画像、404・400・502・503 の応答（`text/plain`）。spec のシナリオ（GitHub API を呼ばないことを含む）をテストにして通す

## 10. 本実装: キャッシュ（spec: image-cache）

- [x] 10.1 画像キャッシュを実装する（正規化したキー、今日を含む画像は TTL 1 時間以下、過去だけの画像は 7 日以上、`Cache-Control`）。テストで次を確認する: 指定方法が違っても同じキーになること、TTL の振り分け、エラーは `no-store` でキャッシュされないこと
- [x] 10.2 過去年の GitHub API 応答を年ごとにキャッシュする。複数年の再描画で GitHub API を呼ぶのが今年の 1 回だけになることをテストで確認する

## 11. 本実装: ログ（spec: access-logging）

- [x] 11.1 D1 のマイグレーション（`logs`: `id`・`ts`・`value`）と、ログの記録（`ctx.waitUntil`）を実装する。テストで次を確認する: spec の全項目（リクエスト・応答・キャッシュ・描画時間・PNG サイズ・`cost`/残量/リセット時刻・国/colo/ASN/HTTP バージョン）が記録されること、除外ヘッダーが含まれないこと、D1 の書き込みが失敗しても 200 で画像が返ること
- [x] 11.2 90 日を超えたログを削除する Cron Trigger を実装し、テストで、89 日前のレコードは残り、91 日前のレコードは消えることを確認する
- [x] 11.3 月単位で JSON Lines（`id`・`ts`・`value`）を取り出すエクスポートのスクリプトを実装する。テストで、各行が `kusa_image.cf_logs` のスキーマ（`id:STRING, ts:TIMESTAMP, value:JSON`）の3列だけを持ち、`value` にレコードの全項目が入ることを確認する

## 12. 本実装: VRT

- [x] 12.1 旧リポジトリの VRT のケース（クエリ形式・パス形式・両方指定・ダーク・存在しないユーザー）に、`past_years=3`・`past_years=19`・`to`・ハロウィン（合成 fixture）を加える。GitHub のモックと `cf dev` を相手に、chromium・firefox・webkit で通ることを確認する（スナップショットは Linux のコンテナで生成する。Apple Silicon では arm64 になり、x86_64 の CI との差は swfz の判断で許容）

## 13. 本実装: デプロイと運用

- [x] 13.1 `kusa-image.swfz.dev` にデプロイする（D1 の作成とマイグレーション、PAT の Secret、`observability` を有効にする）。本番の URL で次を確認する: 1 年分・ダーク・`past_years=19`・存在しないユーザー・`robots.txt` の応答、2 回目のリクエストでキャッシュが HIT すること、D1 にログが入ること。作成した D1 の ID を `cloudflare.config.ts` に書き、VRT の webServer の起動前に `cf d1 migrations apply <id> --local` を流して、VRT でログの書き込みエラーが出ないことも確認する
- [x] 13.2 README（使い方・パラメータ・開発・デプロイ・監視）を書く。監視の手順には、Workers Observability で `exceededCpu` と `rate_limited` を確認する `cf o11y telemetry query` のコマンドを含める。README の手順どおりにコマンドが動くことを確認する

## 14. BigQuery への取り込み（swfz/cloudflare-import-dataform、新規・プライベート）

- [x] 14.1 プライベートリポジトリ `swfz/cloudflare-import-dataform` を作り、BigQuery のテーブル `kusa_image.cf_logs`（`id:STRING, ts:TIMESTAMP, value:JSON`）と、GCS・Workload Identity・Secret（Cloudflare の D1 読み取りトークンなど）を用意する。11.3 のエクスポートで D1 → GCS → BigQuery に取り込むワークフローを作り、`workflow_dispatch` で実行して新しいレコードが `kusa_image.cf_logs` に入ることを確認する
- [x] 14.2 Dataform のビューを作る（既存の `kusa_image_logs` と同じ列に加え、ステータス・エラーの種類・キャッシュ・描画時間・PNG サイズ・`cost`/残量・国/colo/ASN）。新しいレコードで各列が埋まることをクエリで確認する

## 15. 旧サービスの移行（swfz/deno-kusa-image）

- 15.1 Phase 1（301 リダイレクト）は実施しないことにした（2026-11-23）。理由は proposal.md の Phase 1 を参照
- [ ] 15.2 Phase 2: 凡例の行の左側に、移転先と、旧 URL がいずれ使えなくなること（`Moved to kusa-image.swfz.dev. kusa-image.swfz.deno.net will stop working soon`）を赤地に白の太字で描いた案内入り画像を返す版を用意する。VRT で、画像サイズが変わらず案内が描かれていることを確認する。2027-02-01 にデプロイする

## Workflow follow-up

- Deno Deploy の終了（2027年4月）を確認したら、Phase 3 として `swfz/deno-kusa-image` と `swfz/deno-logviewer-import-dataform` をアーカイブする
- 本番で 1102（`exceededCpu`）が実際に出るようになったら、Workers Paid に上げる
- レビューが済んだら、この change を archive する
