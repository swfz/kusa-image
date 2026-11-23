# 設計

## 現状

- kusa-image の Worker は、URL を `parseRequest` で `top` / `robots` / `favicon` / `bad_request` / `image` に振り分けている。パスの最初のセグメントは、すべてユーザー名として扱っている
- GitHub の呼び出しは `fetchContributions` にまとまっている。`contributionCalendar`（`totalContributions`・`isHalloween`・日ごとの `contributionCount`・`contributionLevel`・`date`）と `rateLimit` を取り、エラーを `user_not_found` / `rate_limited` / `upstream_error` に分類する
- キャッシュは Cache API で、キーは非公開のオリジン（`https://cache.kusa-image.internal/v1/...`）に置いている。TTL は、今日を含めば 1時間、過去だけなら 7日
- tools の使い方（proposal.md の Why を参照）
  - サーバー側から `/<user>.json?to=<日付>` を呼ぶ
  - `contributions.flat()` の `contributionCount` と `date` だけを使う
  - ステータスが 200 以外なら、失敗として扱う
  - 連続日数がとぎれるまで、`to` を「前回の応答の最初の日の前日」にずらしながら再帰的に呼ぶ

## 目的と対象外

**目的:**
- tools のコードを変えずに（URL の向き先を変えるだけで）乗り換えられる、互換の JSON を返す
- GitHub の呼び出し、エラーの分類、キャッシュ、ログの仕組みは、画像と同じものを使う

**対象外:**
- フォークの `.term` / `.text` / `.svg`、`from`、`flat`、各日の `color` は作らない
- 複数年をまとめて返す API（`past_years` の JSON 版）は作らない
- `?user=` のクエリ形式は JSON では受け付けない。フォークにもなかったため

## 判断

### `.json` で終わるパスを JSON のリクエストとして振り分ける

`parseRequest` に `kind: 'json'` を足して、最初のセグメントが `.json` で終わるときに振り分ける。GitHub のユーザー名に使える文字は英数字とハイフンだけなので、`.json` で終わる名前の実在ユーザーはいない。今の画像の挙動とはぶつからない。

- 拡張子は小文字の `.json` だけを認める。フォークも小文字だけで、tools も小文字で呼んでいる
- 代わりの案: `/api/<user>` のような別のパスにする。互換が崩れ、tools 側でパスの組み立ても変えることになるので、採らない

### `to` の解釈は画像と同じにする

`to` の検証（`isValidDate`）と、GitHub への渡し方（`${to}T23:59:59Z`）は、画像と同じにする。フォークは `new Date(to).toISOString()`（その日の 00:00:00Z）を渡していた。カレンダーは日単位なので、どちらでも最後の日は `to` になり、tools の再帰の結果は変わらない。

不正な `to` について、フォークは `new Date()` が投げた例外を 400 にしていた。こちらは実在しない日付も 400 にする。tools は検証済みの日付しか渡さないので、影響はない。

### 応答は GitHub の値から必要な項目だけを詰め直す

`isHalloween` などの余計な項目は出さない。応答は、spec にある `contributions`（週の配列）と `totalContributions` だけにする。

- `contributionLevel` は残す。GitHub の値をそのまま出せばよく、フォークの応答にもあった
- `color` は返さない。GraphQL のクエリに足すと画像側の応答も変わるし、tools は使っていない

### エラーは JSON で、ステータスは画像と同じにする

フォークは、どのエラーも 400 と `{ "error": "..." }` で返していた。こちらは画像と同じ分類（400 / 404 / 502 / 503）にして、本文の形だけフォークに合わせる。tools は 200 以外をまとめて失敗として扱うので、影響はない。

### キャッシュは JSON 専用のキーにする

キーは `https://cache.kusa-image.internal/v1/json?user=<小文字>&to=<to>` にする。`to` がないときは、キーにも入れない。TTL は `imageTtl` と同じ判定にする（`to` が昨日以前なら 7日、それ以外は 1時間）。判定は関数として切り出して、画像と JSON で同じものを使う。

- 年ごとのカレンダーのキャッシュ（`/v1/calendar`）は使い回さない。tools の `to` は任意の日付で、暦年にそろわないため
- 代わりの案: 年ごとのキャッシュを組み合わせて任意の期間を作る。GitHub の `totalContributions` と、週の区切りを再現する必要があり、手間に見合わないので採らない

### ログは既存の項目のまま記録する

`RequestMeta` には、`user`・`to`・`cache`・`github` だけを入れる。JSON か画像かは、ログの `url` の拡張子で見分けられる。D1 のスキーマ、エクスポートの形式（`id`/`ts`/`value`）、`cloudflare-import-dataform` のビューは変えない。

### CORS

フォークと同じく、JSON の応答（エラーを含む）にだけ `Access-Control-Allow-Origin: *` を付ける。画像は `<img>` で埋め込むものなので、付けない。

## リスクとトレードオフ

- [tools の再帰の `to` は日ごとに変わるので、過去の期間でもキャッシュが翌日以降に当たらない] → 1回の呼び出しの cost は 1 で、連続日数 1 年あたり 1 回しか呼ばない。ログの `github_cost` で消費を見て、多ければ年ごとのキャッシュを組み合わせる方式を検討する
- [誰でも JSON を呼べるので、PAT のレートリミットを消費される] → 画像のエンドポイントと同じ条件なので、リスクは今と変わらない。ログの `rate_limited` の件数で監視する（README の監視のクエリを使う）
- [フォークの `.json` を tools 以外が使っていた場合、`color` や `from` がないと困る] → フォークの公開 URL は tools のために立てたもので、ほかの利用者は想定しない。Deno Deploy が終わるまでは、フォーク側も動き続ける

## 移行計画

1. kusa-image に JSON API を足してデプロイし、本番で `/swfz.json` と `/swfz.json?to=<過去の日付>` を確認する
2. tools の `CONTRIBUTION_API_URL` のデフォルトを `https://kusa-image.swfz.dev` に変える PR を出し、マージする。Vercel の環境変数で `CONTRIBUTION_API_URL` を上書きしていないことも確かめる
3. tools の本番で `/kusa/swfz` の今日・昨日・連続日数・カバー率が出ることを確認する
4. フォーク（`swfz/deno-github-contributions-api`）をアーカイブする

切り戻すときは、tools の `CONTRIBUTION_API_URL` を Vercel の環境変数でフォークの URL に向ける。Deno Deploy が終わるまでは使える。
