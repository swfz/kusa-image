# Spec Delta

## Purpose

GitHub ユーザーのコントリビューションカレンダーを JSON で返す。`swfz/tools` などが日ごとのコントリビューション数を計算に使うための公開 HTTP エンドポイントで、`deno-github-contributions-api` の `.json` と互換の形式で返す。

## ADDED Requirements

### Requirement: JSON のエンドポイント
システムは、`GET /<user>.json` へのリクエストに対して、ユーザー `<user>` のコントリビューションカレンダーを、ステータス 200、`content-type: application/json; charset=utf-8` の JSON で返さなければならない（SHALL）。拡張子 `.json` を除いた部分をユーザー名とし、英大文字と小文字を区別してはならない（MUST NOT）。

#### Scenario: JSON を取得する
- **WHEN** `GET /swfz.json` にリクエストする
- **THEN** ステータス 200、`content-type: application/json; charset=utf-8` で、ユーザー `swfz` のカレンダーを返す

#### Scenario: 大文字のユーザー名
- **WHEN** `GET /SWFZ.json` にリクエストする
- **THEN** `GET /swfz.json` と同じ内容を返す

#### Scenario: 拡張子のないパスは画像のまま
- **WHEN** `GET /swfz` にリクエストする
- **THEN** これまで通り PNG の草画像を返す

### Requirement: 応答の形式
システムは、JSON の応答を `{ "contributions": Day[][], "totalContributions": number }` の形にしなければならない（SHALL）。
- `contributions` は週ごとの配列で、古い週から新しい週の順に並べる。各週の中の日も古い日から並べる
- 各日（Day）は `contributionCount`（数値）、`contributionLevel`（`NONE`〜`FOURTH_QUARTILE`）、`date`（`YYYY-MM-DD`）を持つ
- 値は GitHub API の contributionCalendar に従う

#### Scenario: 形式が互換
- **WHEN** 直近1年の合計が 1234 のユーザーの `GET /<user>.json` を取得する
- **THEN** `totalContributions` は `1234` で、`contributions.flat()` の最後の要素の `date` は今日の日付になる

#### Scenario: 日の項目
- **WHEN** `GET /swfz.json` を取得する
- **THEN** `contributions` の各日が `contributionCount`・`contributionLevel`・`date` を持つ

### Requirement: 終了日の指定
システムは、クエリパラメータ `to`（`YYYY-MM-DD`）を受け取ったとき、その日を最後の日とする1年分を返さなければならない（SHALL）。`to` が空または未指定のときは直近1年分を返さなければならない（SHALL）。`to` が `YYYY-MM-DD` の実在する日付として解釈できない場合は、ステータス 400 を返さなければならない（SHALL）。

#### Scenario: 終了日を指定する
- **WHEN** `GET /swfz.json?to=2023-12-31` にリクエストする
- **THEN** `contributions.flat()` の最後の要素の `date` が `2023-12-31` になる

#### Scenario: 不正な終了日
- **WHEN** `GET /swfz.json?to=2023-13-45` にリクエストする
- **THEN** ステータス 400 を返し、GitHub API は呼び出さない

### Requirement: 画像向けのパラメータは無視する
システムは、JSON のリクエストで `theme`・`past_years`・`user` のクエリパラメータを無視しなければならない（SHALL）。応答の内容は、パスのユーザー名と `to` だけで決まらなければならない（SHALL）。

#### Scenario: past_years を付けた
- **WHEN** `GET /swfz.json?past_years=3` にリクエストする
- **THEN** `GET /swfz.json` と同じ直近1年分を返す

#### Scenario: user を付けた
- **WHEN** `GET /swfz.json?user=octocat` にリクエストする
- **THEN** ユーザー `swfz` のカレンダーを返す

### Requirement: エラーの応答
システムは、JSON のリクエストが失敗したとき、`content-type: application/json; charset=utf-8`、`Cache-Control: no-store` で、`{ "error": "<説明>" }` を返さなければならない（SHALL）。ステータスは画像と同じとする（SHALL）。
- 不正な `to`、または空のユーザー名（`/.json`）は 400
- 存在しないユーザーは 404
- GitHub API の失敗は 502、レートリミット超過は 503

#### Scenario: 存在しないユーザー
- **WHEN** 存在しないユーザー `no-such-user-xyz` で `GET /no-such-user-xyz.json` にリクエストする
- **THEN** ステータス 404 で、`{ "error": "Could not resolve to a User. no-such-user-xyz" }` を返す

#### Scenario: 空のユーザー名
- **WHEN** `GET /.json` にリクエストする
- **THEN** ステータス 400 を返し、GitHub API は呼び出さない

#### Scenario: レートリミット超過
- **WHEN** GitHub API がレートリミット超過のエラーを返す
- **THEN** ステータス 503、`Cache-Control: no-store` で、レートリミットが原因であることがわかる `error` を返す

### Requirement: ブラウザから呼べる
システムは、JSON の応答（エラーを含む）に `Access-Control-Allow-Origin: *` を付けなければならない（SHALL）。

#### Scenario: CORS ヘッダー
- **WHEN** `GET /swfz.json` にリクエストする
- **THEN** 応答に `Access-Control-Allow-Origin: *` が付いている

### Requirement: JSON のキャッシュ
システムは、成功した JSON の応答を、同じユーザー（英大文字と小文字を区別しない）と同じ `to` のリクエストに対してキャッシュから返さなければならない（SHALL）。TTL と `Cache-Control` の `max-age` は次の通りとする（SHALL）。
- 期間に今日を含む（`to` が未指定、または今日以降）: 1時間以下
- 期間がすべて過去（`to` が昨日以前）: 7日以上

エラーの応答はキャッシュしてはならない（MUST NOT）。画像のキャッシュとは別に持たなければならない（SHALL）。

#### Scenario: 同じ内容のリクエスト
- **WHEN** `GET /swfz.json?to=2023-12-31` の直後に `GET /SWFZ.json?to=2023-12-31&theme=dark` にリクエストする
- **THEN** 2回目はキャッシュから返し、GitHub API を呼び出さない

#### Scenario: 今日を含む期間
- **WHEN** `GET /swfz.json` にリクエストする
- **THEN** 応答の `Cache-Control` の `max-age` は 3600 以下である

#### Scenario: 過去だけの期間
- **WHEN** 2026年に `GET /swfz.json?to=2023-12-31` にリクエストする
- **THEN** 応答の `Cache-Control` の `max-age` は 604800 以上である

#### Scenario: 画像とは別のキャッシュ
- **WHEN** `GET /swfz` の直後に `GET /swfz.json` にリクエストする
- **THEN** 2回目は PNG ではなく JSON を返す

### Requirement: アクセスログ
システムは、JSON へのリクエストも、画像と同じアクセスログに1件ずつ記録しなければならない（SHALL）。ログレコードの `user` と `to` には解釈した値を入れ、画像に固有の項目（`theme`、`past_years`、描画時間、PNG のバイト数）は null としなければならない（SHALL）。

#### Scenario: JSON のリクエストを記録する
- **WHEN** キャッシュにヒットせず `GET /swfz.json?to=2023-12-31` を返す
- **THEN** ログレコードの `url` はそのリクエストの URL、`user` は `swfz`、`to` は `2023-12-31`、`cache` は `miss` になり、GitHub API の `cost` が入る
