# タスク

## 1. URL の解釈

- [x] 1.1 `parseRequest` に `kind: 'json'` を追加する。最初のセグメントが `.json` で終わるときに、ユーザー名（`.json` を除いた部分）と `to` を返し、`theme`・`past_years`・`?user=` は無視する。空のユーザー名（`/.json`）と不正な `to` は、JSON 用の `bad_request` にする。`test/params.test.ts` に次のケースを足して通ることを確認する: `/swfz.json`、`/SWFZ.json`、`?to=2023-12-31`、空の `to`、`to=2023-13-45`、`/.json`、`?past_years=3`・`?theme=dark`・`?user=octocat` の無視、`/swfz` が引き続き `image` になること、`/swfz.JSON` が `image` のままであること

## 2. 応答の組み立てとキャッシュ

- [x] 2.1 `ContributionCalendar` を `{ contributions: Day[][], totalContributions }`（各日は `contributionCount`・`contributionLevel`・`date`、`isHalloween` は含めない）に変換する関数を追加する。ユニットテストで、項目と並び順（古い週・古い日から）が保たれ、余計な項目が出ないことを確認する
- [x] 2.2 TTL の判定（`to` が昨日以前なら `LONG_TTL`、それ以外は `SHORT_TTL`）を画像と JSON の両方で使える形に切り出し、JSON 用のキャッシュキー（`/v1/json?user=<小文字>&to=<to>`、`to` がなければ含めない）を追加する。`test/cache.test.ts` で、大文字と小文字で同じキーになること、画像のキーと重ならないこと、TTL の境界（今日・昨日・未指定）を確認し、既存の画像のテストも通ることを確認する
- [x] 2.3 JSON 用のエラー応答（`{ "error": "<説明>" }`、`application/json; charset=utf-8`、`no-store`、ステータスは画像と同じ対応表）と、成功の応答を作る関数を追加する。どちらにも `Access-Control-Allow-Origin: *` を付ける。ユニットテストで、ステータス・ヘッダー・本文を種類ごとに確認する

## 3. ルーティング

- [x] 3.1 `index.ts` に `json` の分岐を追加する。キャッシュを見て、なければ `fetchContributions` を呼び、成功した応答だけをキャッシュに入れる。`RequestMeta` には `user`・`to`・`cache`・`github` を入れる。`test/index.test.ts` に spec のシナリオを足して通ることを確認する: 200 と形式、`to` の指定（最後の日と GitHub に渡す変数）、大文字のユーザー名、無視するパラメータ、404 / 400（GitHub を呼ばない）/ 502 / 503 と `no-store`、CORS ヘッダー、2回目がキャッシュから返る（GitHub を呼ばない）、エラーはキャッシュしない、`max-age`（今日を含む・過去だけ）、`/swfz` の後の `/swfz.json` が JSON になる、ログレコードの `user`・`to`・`cache`・`github_cost` と画像の項目が null
- [x] 3.2 lint・typecheck・ユニットテスト・VRT（`pnpm lint`、`pnpm format:check`、`pnpm typecheck`、`pnpm test`、`pnpm test:vrt`）をすべて通し、画像の VRT のスナップショットに差分が出ないことを確認する

## 4. ドキュメント

- [x] 4.1 README に JSON API の節を追加する（URL、`to`、応答の例、エラー、キャッシュ、tools が使っていること）。トップページの使い方には載せない。README の例の URL を本番で叩いて、書いた通りの応答が返ることを 5.1 で確認する

## 5. リリースと tools の切り替え

- [x] 5.1 kusa-image を本番にデプロイし、`curl` で `/swfz.json`（`max-age` が 3600 以下、最後の日が今日）、`/swfz.json?to=2023-12-31`（最後の日が `2023-12-31`、`max-age` が 604800 以上）、`/no-such-user-xyz.json`（404 の JSON）を確認する。D1 のログに JSON のリクエストが記録されていることも確認する
- [x] 5.2 本番の `/swfz.json` と、フォーク（`forked-contributions-api.swfz.deno.net/swfz.json`）の応答を比べ、`totalContributions` と各日の `date`・`contributionCount` が一致することを確認する
- [x] 5.3 `swfz/tools` で `CONTRIBUTION_API_URL` のデフォルトを `https://kusa-image.swfz.dev` に変え、e2e のモックの URL を合わせる PR を出す。tools の lint・ユニットテスト・e2e が通ること、Vercel のプレビューの `/kusa/swfz` で今日・昨日・連続日数・カバー率が表示されることを確認する。Vercel の環境変数で `CONTRIBUTION_API_URL` を上書きしていないことも確認する

## 後続の作業（進捗の対象外）

- tools の PR のマージ後、本番の `/kusa/swfz` を確認してから、`swfz/deno-github-contributions-api` をアーカイブする
- `migrate-to-cloudflare-workers` をアーカイブしてから、この change をアーカイブする（`contributions-json` は独立した capability なので、順序の制約はないが、まとめて main specs に入れる）
