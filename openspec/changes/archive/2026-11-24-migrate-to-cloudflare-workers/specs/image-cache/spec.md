# Spec Delta

## Purpose

生成した草画像と GitHub API の応答をキャッシュする。描画の CPU 負荷と GitHub API の消費を抑えつつ、内容の鮮度を期間の性質に応じて保つ。

## ADDED Requirements

### Requirement: 同じ内容のリクエストにはキャッシュを返す
システムは、描画結果が同じになるリクエストに対して、TTL の間は再描画せずにキャッシュした画像を返さなければならない（SHALL）。

キャッシュキーは、次の正規化した値で決めなければならない（SHALL）。
- ユーザー（英大文字と小文字を区別しない）
- テーマ（`light` または `dark`）
- `past_years`（補正後の値）
- `to`（`past_years` を指定した場合は無視する）
- 指定方法の違い（パス形式かクエリ形式か、パラメータの順序、未知のパラメータ）はキーに含めない

#### Scenario: 指定方法が違っても同じキャッシュ
- **WHEN** `GET /swfz?theme=dark` の直後に `GET /?theme=dark&user=SWFZ` にリクエストする
- **THEN** 2回目はキャッシュから返し、GitHub API の呼び出しも描画もしない

#### Scenario: 補正後に同じ値になる
- **WHEN** 2026年に `GET /swfz?past_years=30` の直後に `GET /swfz?past_years=19` にリクエストする
- **THEN** 2回目はキャッシュから返す

#### Scenario: テーマが違う
- **WHEN** `GET /swfz` の直後に `GET /swfz?theme=dark` にリクエストする
- **THEN** 2回目は別の画像として描画する

### Requirement: 今年を含む画像は短い TTL
システムは、描画対象の期間に今日を含む画像のキャッシュ TTL を、1時間以下にしなければならない（SHALL）。対象は、デフォルト期間、`to` が今日以降、`past_years` を指定したもの。

#### Scenario: デフォルト期間
- **WHEN** `GET /swfz` の画像をキャッシュしてから 1 時間を超えた後にリクエストする
- **THEN** GitHub API から取得し直して再描画する

### Requirement: 過去だけの画像は長い TTL
システムは、描画対象の期間がすべて過去（`to` が昨日以前）の画像のキャッシュ TTL を、7日以上にしなければならない（SHALL）。

#### Scenario: 過去の終了日
- **WHEN** `GET /swfz?to=2023-12-31` の画像をキャッシュしてから 1 日後に同じリクエストをする
- **THEN** キャッシュから返す

### Requirement: 複数年表示の過去分のデータを再利用する
システムは、`past_years` の表示で、昨年以前の各年の GitHub API の応答を年ごとにキャッシュし、TTL を 7日以上にしなければならない（SHALL）。画像キャッシュが切れて再描画するときも、取得し直すのは今年の分だけでなければならない（SHALL）。

#### Scenario: 複数年の再描画
- **WHEN** `GET /swfz?past_years=14` の画像キャッシュが切れた後に同じリクエストをし、過去分の年データのキャッシュはまだ有効である
- **THEN** GitHub API へのリクエストは今年の 1 回だけになる

### Requirement: エラーはキャッシュしない
システムは、GitHub API の失敗によるエラー応答（5xx）をキャッシュしてはならない（MUST NOT）。存在しないユーザーへの 404 は、10分以下の TTL でキャッシュしてもよいが（MAY）、それより長くキャッシュしてはならない（MUST NOT）。

#### Scenario: 一時的な失敗からの回復
- **WHEN** GitHub API の失敗で 502 を返した直後、GitHub API が回復してから同じリクエストをする
- **THEN** 正常な画像を返す

### Requirement: 下流に向けた Cache-Control
システムは、画像の応答に、その画像のキャッシュ TTL 以下の `max-age` を持つ `Cache-Control` ヘッダーを付けなければならない（SHALL）。エラー応答には `Cache-Control: no-store` を付けなければならない（SHALL）。

#### Scenario: 画像の応答
- **WHEN** `GET /swfz` にリクエストする
- **THEN** 応答に `Cache-Control` が付いていて、その `max-age` は 3600 以下である

#### Scenario: エラーの応答
- **WHEN** GitHub API の失敗で 502 を返す
- **THEN** 応答に `Cache-Control: no-store` が付いている
