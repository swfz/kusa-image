# 提案

## 背景

`swfz/tools` の `/kusa/<user>` ページは、今日・昨日のコントリビューション数、連続日数、カバー率をサーバー側で計算している。その元データを、`forked-contributions-api.swfz.deno.net` から取っている。これは `kawarimidoll/deno-github-contributions-api` のフォークで、独自の変更はない。動いているのは Deno Deploy 上なので、2027年4月の Deno Deploy の終了とともに使えなくなる。

tools は GitHub のトークンを持っていない。GitHub の GraphQL API はトークンがないと呼べないため、tools から直接呼ぶ形にはできない。一方で kusa-image は、同じ GraphQL のクエリ（contributionCalendar）を PAT・キャッシュ・ログ付きですでに持っている。そこで、kusa-image に JSON の API を追加して、フォークを置き換える。

## 変更内容

- kusa-image に `GET /<user>.json` を追加する。コントリビューションカレンダーを JSON で返す
  - 応答は、フォークの `.json` が返す形と互換にする: `{ contributions: Day[][], totalContributions }`。`contributions` は週ごとの配列で、各日は `contributionCount`、`contributionLevel`、`date` を持つ
  - クエリパラメータ `to`（`YYYY-MM-DD`）で、その日を終わりとする1年分を返す。指定がなければ直近1年分
  - フォークにある他の機能（`.term`・`.text`・`.svg`、`from`、`flat`、各日の `color`）は追加しない。tools が使っていないため
- JSON の応答も、画像と同じ方針で Cache API にキャッシュする。過去だけの期間は長く、今日を含む期間は短くする
- JSON へのリクエストも、ほかのリクエストと同じくアクセスログに記録する
- `swfz/tools` の `CONTRIBUTION_API_URL` のデフォルトを `https://kusa-image.swfz.dev` に変える
- フォーク（`swfz/deno-github-contributions-api`）は、tools の切り替えが終わったらアーカイブする

## ケイパビリティ

### 新しいケイパビリティ

- `contributions-json`: コントリビューションカレンダーを JSON で返す HTTP エンドポイント。URL と `to` の解釈、応答の形式（フォークとの互換）、エラー時の応答、キャッシュ、CORS を含む

### 変更するケイパビリティ

（なし。`contribution-image`・`image-cache`・`access-logging` は `migrate-to-cloudflare-workers` で追加するもので、まだ `openspec/specs/` にない。この change では要件を変えない。`.json` のパスは画像のユーザー名として扱わなくなるが、GitHub のユーザー名に `.` は使えないので、既存の画像の挙動は変わらない）

## 影響範囲

- **kusa-image**: URL の解釈（`params.ts`）、ルーティング（`index.ts`）、キャッシュキー（`cache.ts`）、ユニットテストを変える。GitHub クライアントと過去の年のキャッシュはそのまま使う。README に JSON API のことを書く
- **GitHub API の消費**: tools からの呼び出しが kusa-image の PAT の枠を使うようになる。tools は連続日数を数えるために、`to` をずらしながら過去の年をさかのぼって呼ぶ。過去の期間は長くキャッシュするので、2回目以降の消費は少ない
- **swfz/tools**: `pages/kusa/[username].tsx` のデフォルトの URL を変え、e2e のモックを合わせる（別の PR）
- **swfz/deno-github-contributions-api**: tools の切り替えが終わったらアーカイブする
- この change は `migrate-to-cloudflare-workers` の実装（main にマージ済み）の上に作る
