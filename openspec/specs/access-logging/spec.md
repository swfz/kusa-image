# access-logging Specification

## Purpose

利用状況・埋め込み先・エラー・運用上の余裕（キャッシュの効き、描画コスト、GitHub API の残量）を把握するために、リクエストごとのアクセスログを記録し、BigQuery の分析基盤に取り込めるようにする。

## Requirements

### Requirement: すべてのリクエストを記録する
システムは、エンドポイントへのすべてのリクエスト（画像・トップページ・予約パス・エラーを含む）について、1件のログレコードを記録しなければならない（SHALL）。

#### Scenario: 画像のリクエスト
- **WHEN** `GET /swfz` にリクエストする
- **THEN** そのリクエストのログレコードが 1 件記録される

#### Scenario: エラーになったリクエスト
- **WHEN** 存在しないユーザーへのリクエストで 404 を返す
- **THEN** そのリクエストのログレコードが記録される

### Requirement: リクエストの内容を記録する
システムは、各ログレコードにリクエストの内容を含めなければならない（SHALL）。
- 時刻（UNIX 秒）
- メソッド
- URL
- 除外対象以外のリクエストヘッダー（`user-agent` と `referer` を含む）
- 解釈したユーザー、テーマ、`to`、`past_years`

#### Scenario: パラメータを記録する
- **WHEN** `GET /swfz?theme=dark&past_years=3` にリクエストする
- **THEN** ログレコードの `user` は `swfz`、`theme` は `dark`、`past_years` は `3` になる

### Requirement: 応答と処理の結果を記録する
システムは、各ログレコードに応答と処理の結果を含めなければならない（SHALL）。値が存在しない項目は null とする（SHALL）。
- ステータスコード
- エラーの種類（`user_not_found` / `bad_request` / `upstream_error` / `rate_limited` / なし）
- 画像キャッシュのヒットかミスか
- 描画にかかった時間（ミリ秒）
- 応答した PNG のバイト数
- GitHub API を呼んだ場合はそのリクエストの消費量（`cost`）、レートリミットの残量、リセット時刻

残量はトークンの所有者の他の利用とも共有する値なので、このサービスの消費量は `cost` で集計できるようにする。

#### Scenario: キャッシュにヒット
- **WHEN** キャッシュから画像を返す
- **THEN** ログレコードはキャッシュのヒットを示し、描画時間と GitHub API の `cost`・残量・リセット時刻は null になる

#### Scenario: GitHub API を呼んだ
- **WHEN** キャッシュにヒットせず、GitHub API を 1 回呼んで画像を返す
- **THEN** ログレコードには、その呼び出しの `cost`、レートリミットの残量、リセット時刻が入る

#### Scenario: 複数年で GitHub API を複数回呼んだ
- **WHEN** `past_years` の表示で GitHub API を複数回呼ぶ
- **THEN** ログレコードの `cost` はそれらの合計になり、残量とリセット時刻は最後の呼び出しの値になる

#### Scenario: レートリミット超過
- **WHEN** GitHub API がレートリミット超過で失敗する
- **THEN** ログレコードのステータスは 503、エラーの種類は `rate_limited` になる

### Requirement: 接続元の属性を記録する
システムは、各ログレコードに、エッジが提供する接続元の属性を含めなければならない（SHALL）。対象は国、データセンター（colo）、AS 番号、HTTP プロトコルのバージョン。

#### Scenario: 接続元の属性
- **WHEN** 日本からリクエストする
- **THEN** ログレコードの国は `JP` になる

### Requirement: 個人を特定しうる情報と秘密を除外する
システムは、IP アドレスと認証情報をログに記録してはならない（MUST NOT）。除外するヘッダー（大文字と小文字を区別しない）は次の通り。
- `authorization`、`proxy-authorization`
- `cookie`、`set-cookie`
- `x-forwarded-for`、`x-real-ip`、`cf-connecting-ip`、`cf-connecting-ipv6`、`true-client-ip`

#### Scenario: IP ヘッダーの除外
- **WHEN** `cf-connecting-ip` と `Cookie` ヘッダーを持つリクエストを受ける
- **THEN** ログレコードのどこにもその値が含まれない

### Requirement: ログの失敗で応答を壊さない
システムは、ログの記録に失敗しても、利用者への応答を正常に返さなければならない（SHALL）。また、ログの記録を待って応答を遅らせてはならない（MUST NOT）。

#### Scenario: ログの保存先が使えない
- **WHEN** ログの保存先への書き込みがエラーになる
- **THEN** 画像のリクエストには通常通り 200 で画像を返す

### Requirement: 保持期間
システムは、ログレコードを少なくとも 90 日間は保持しなければならない（SHALL）。90 日を超えたレコードは削除してもよい（MAY）。

#### Scenario: 90 日以内のログ
- **WHEN** 89 日前のログレコードを取り出す
- **THEN** そのレコードが含まれている

### Requirement: BigQuery 取り込み用のエクスポート
システムは、指定した年月のログレコードを JSON Lines 形式で取り出せなければならない（SHALL）。各行は、新しい BigQuery テーブル `kusa_image.cf_logs` のスキーマ（`id:STRING, ts:TIMESTAMP, value:JSON`）に合わせる。旧サービスのログ（`kusa_image.logs`）とは別のテーブルに入れ、同じテーブルに混ぜてはならない（MUST NOT）。
- `id` にはレコードを一意に識別する値を入れる
- `ts` にはタイムスタンプ（ISO 8601、UTC）を入れる
- `value` にはレコードの全項目を入れる

#### Scenario: 月単位で取り出す
- **WHEN** 2027年1月分のログを取り出す
- **THEN** 2027年1月のレコードだけを、1行1レコードの JSON Lines で得られる

#### Scenario: 新しいテーブルのスキーマに合う
- **WHEN** 取り出したデータを `kusa_image.cf_logs` に読み込む
- **THEN** 各行が `id`・`ts`・`value` の3列に読み込まれ、`value` からレコードの全項目（`value.method`、`value.headers.user-agent`、`value.cache` など）を取り出せる

#### Scenario: 旧サービスのログと混ざらない
- **WHEN** 移行期間に、旧 URL と新 URL の両方にリクエストが来る
- **THEN** 旧サービスのログは `kusa_image.logs` に、新サービスのログは `kusa_image.cf_logs` にだけ入る
