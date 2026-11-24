# Spec Delta

## Purpose

GitHub ユーザーのコントリビューションカレンダー（草）を PNG 画像として返す。README・個人サイト・OGP・Slack の展開に埋め込んで使う公開 HTTP エンドポイント。

## ADDED Requirements

### Requirement: 対象ユーザーの指定
システムは、パスの最初のセグメント（`/<user>`）またはクエリパラメータ `user`（`/?user=<user>`）で対象の GitHub ユーザーを受け付けなければならない（SHALL）。両方が指定された場合はパスの値を優先しなければならない（SHALL）。

#### Scenario: パス形式で指定する
- **WHEN** `GET /swfz` にリクエストする
- **THEN** ユーザー `swfz` の草画像を返す

#### Scenario: クエリ形式で指定する
- **WHEN** `GET /?user=swfz` にリクエストする
- **THEN** ユーザー `swfz` の草画像を返す

#### Scenario: 両方を指定したらパスが優先される
- **WHEN** `GET /swfz?user=octocat` にリクエストする
- **THEN** ユーザー `swfz` の草画像を返す

### Requirement: トップページ
システムは、ユーザーが指定されていないリクエストに対して、サービスの使い方を説明する HTML ページを返さなければならない（SHALL）。

#### Scenario: ルートにアクセスする
- **WHEN** `GET /` にリクエストする
- **THEN** ステータス 200、`content-type: text/html` の使い方ページを返す

#### Scenario: user パラメータが空
- **WHEN** `GET /?user=` にリクエストする
- **THEN** 使い方ページを返し、GitHub API は呼び出さない

### Requirement: 予約パスはユーザー名として扱わない
システムは、`/robots.txt` と `/favicon.ico` をユーザー名として扱ってはならず（MUST NOT）、それぞれに専用の応答を返さなければならない（SHALL）。これらのリクエストで GitHub API を呼び出してはならない（MUST NOT）。

#### Scenario: robots.txt
- **WHEN** `GET /robots.txt` にリクエストする
- **THEN** ステータス 200、`content-type: text/plain` の robots.txt を返す。内容は画像の取得を許可するもの（OGP クローラーを妨げない）とし、GitHub API は呼び出さない

#### Scenario: favicon.ico
- **WHEN** `GET /favicon.ico` にリクエストする
- **THEN** アイコン画像、またはステータス 404 を返し、GitHub API は呼び出さない

### Requirement: PNG で出力する
システムは、草画像を `content-type: image/png` の PNG として、ステータス 200 で返さなければならない（SHALL）。画像の幅は 670px、1年分の行の高さは 140px でなければならない（SHALL）。

#### Scenario: 1年分の画像
- **WHEN** `GET /swfz` にリクエストする
- **THEN** `content-type: image/png` で、670x140px の PNG を返す

### Requirement: 画像の描画内容
システムは、1年分の行ごとに次の要素を描画しなければならない（SHALL）。
- サマリー文
- 曜日ラベル（Mon / Wed / Fri）
- 月ラベル（各月の最初の週の位置）
- 日ごとのマス（GitHub の contributionLevel に応じた 5 段階の色）
- 凡例（Less・5色のマス・More）

サマリー文は `<total> contributions in <期間> (max <最大値>/day)` の形式とする。

#### Scenario: デフォルト期間のサマリー文
- **WHEN** パラメータなしで、直近1年の合計が 1234、1日の最大が 25 のユーザーをリクエストする
- **THEN** サマリー文は `1234 contributions in the last year (max 25/day)` になる

#### Scenario: マスの色
- **WHEN** ある日の contributionLevel が `FOURTH_QUARTILE` である
- **THEN** その日のマスを、そのテーマで一番濃い色で描画する

#### Scenario: 月ラベル
- **WHEN** ある週の初日の月が、前の週の初日の月と異なる
- **THEN** その週の列の上に、その月の英語略称（例: `Jan`）を描画する

### Requirement: テーマ
システムは、クエリパラメータ `theme=dark` のときダークテーマ（黒背景・白文字・ダーク用の配色）で描画しなければならない（SHALL）。それ以外の値や未指定のときはライトテーマ（白背景・黒文字・ライト用の配色）で描画しなければならない（SHALL）。

#### Scenario: ダークテーマ
- **WHEN** `GET /swfz?theme=dark` にリクエストする
- **THEN** 背景が `#000000`、レベル `NONE` のマスが `#161b22` の画像を返す

#### Scenario: 未知のテーマ値
- **WHEN** `GET /swfz?theme=blue` にリクエストする
- **THEN** ライトテーマの画像を返す

### Requirement: ハロウィン配色
システムは、GitHub API がその期間を Halloween と判定した場合（`isHalloween: true`）、テーマごとのハロウィン配色でマスと凡例を描画しなければならない（SHALL）。

#### Scenario: ハロウィン期間
- **WHEN** GitHub API が `isHalloween: true` を返すユーザーを、ライトテーマでリクエストする
- **THEN** レベル `FOURTH_QUARTILE` のマスを `#0c001c` で描画する

### Requirement: 終了日の指定
システムは、クエリパラメータ `to`（`YYYY-MM-DD`）を受け取ったとき、その日を終わりとする1年分を描画しなければならない（SHALL）。サマリー文の期間は `<最初の日>~<最後の日>` としなければならない（SHALL）。`to` が `YYYY-MM-DD` として解釈できない場合は、ステータス 400 と `content-type: text/plain` の説明文を返さなければならない（SHALL）。

#### Scenario: 終了日を指定する
- **WHEN** `GET /swfz?to=2023-12-31` にリクエストする
- **THEN** 2023-12-31 を終わりとする1年分を描画し、サマリー文の期間は `2023-01-01~2023-12-31` の形式（実際の範囲は GitHub API の応答に従う）になる

#### Scenario: 不正な終了日
- **WHEN** `GET /swfz?to=2023-13-45` にリクエストする
- **THEN** ステータス 400、`content-type: text/plain` を返す

### Requirement: 複数年の表示
システムは、クエリパラメータ `past_years=N` を受け取ったとき、今年から N 年分の暦年（1/1〜12/31）を1年ずつ縦に並べて描画しなければならない（SHALL）。
- 古い年を上、今年を一番下に置く
- 各行のサマリー文の期間は西暦の年とする
- 画像の高さは 140px × N とする
- `past_years` を指定した場合、`to` は無視する

#### Scenario: 3年分
- **WHEN** 2026年に `GET /swfz?past_years=3` にリクエストする
- **THEN** 670x420px の画像の上から順に 2024・2025・2026 年の行を描画し、各サマリー文の期間は `2024` などの年になる

#### Scenario: to と同時に指定する
- **WHEN** `GET /swfz?past_years=2&to=2020-01-01` にリクエストする
- **THEN** `to` を無視して、今年と昨年の2年分を描画する

### Requirement: past_years の値の補正
システムは、`past_years` を整数として解釈し、次のように補正しなければならない（SHALL）。
- 解釈できない値、または 1 未満の値は 1 とする
- GitHub のサービス開始年（2008年）から今年までの年数を超える値は、その年数とする

この補正後の最大値（全年分）は、全期間の表示として必ず受け付けなければならない（MUST）。

#### Scenario: 上限を超える
- **WHEN** 2026年に `GET /swfz?past_years=30` にリクエストする
- **THEN** 2008〜2026 年の 19 年分を描画する

#### Scenario: 全年分
- **WHEN** 2026年に `GET /swfz?past_years=19` にリクエストする
- **THEN** 670x2660px の画像を、エラーにならずに返す

#### Scenario: 解釈できない値
- **WHEN** `GET /swfz?past_years=abc` または `past_years=0` または `past_years=２`（全角）にリクエストする
- **THEN** 1 年分を描画する

### Requirement: 存在しないユーザー
システムは、GitHub 上に存在しないユーザーを指定されたとき、ステータス 404 と `content-type: text/plain; charset=utf-8` で、`Could not resolve to a User. <user>` を返さなければならない（SHALL）。`past_years` を指定した場合も同じ応答としなければならない（SHALL）。

#### Scenario: 存在しないユーザー
- **WHEN** 存在しないユーザー `no-such-user-xyz` で `GET /no-such-user-xyz` にリクエストする
- **THEN** ステータス 404 で、本文 `Could not resolve to a User. no-such-user-xyz` を返す

#### Scenario: 存在しないユーザーで複数年を指定する
- **WHEN** `GET /no-such-user-xyz?past_years=3` にリクエストする
- **THEN** ステータス 404 で同じ本文を返す（500 にはしない）

### Requirement: GitHub API の失敗
システムは、GitHub API がエラーを返した場合（応答なし・5xx・レートリミット超過を含む）、ステータス 502 または 503 と `content-type: text/plain` の説明文を返さなければならない（SHALL）。この場合に壊れた画像を返してはならない（MUST NOT）。

#### Scenario: レートリミット超過
- **WHEN** GitHub API がレートリミット超過のエラーを返す
- **THEN** ステータス 503 と、レートリミットが原因であることがわかる説明文を返す

#### Scenario: GitHub API の 5xx
- **WHEN** GitHub API が 502 を返す
- **THEN** ステータス 502 と説明文を返す
