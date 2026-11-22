# Proposal

## Why

GitHub の草画像を返す公開サービス `swfz/deno-kusa-image`（`kusa-image.swfz.deno.net`）は Deno Deploy 上で動いている。Deno Deploy は 2027年4月に終了する（2026-10-09 の発表、日付は未公表）。終了までに Cloudflare Workers へ移し、既存の埋め込み利用者が新しい URL に乗り換えられる移行期間を設ける必要がある。

前回 Deploy Classic（`kusa-image.deno.dev`）から移したときは案内を出さなかった。その結果、旧ドメインのログは 2026-06-30 で止まり、クエリ形式で埋め込んでいた利用者の多くは新ドメインに現れていない。今回は利用者を失わないように、移行の段取りまで含めて計画する。

## What Changes

- 画像生成サービスを Cloudflare Workers（Free プラン）上に作り直す。CPU 上限を超える場合だけ Paid に上げる。コードは変えずに上げられる構成にする
- 出力は PNG を必須とする（OGP・Slack の展開・README で使われているため）
- URL とパラメータは既存と完全に互換にする
  - `/<user>`（パス形式）と `/?user=<user>`（クエリ形式）の両方。両方指定されたらパス形式を優先する
  - `to`・`theme`・`past_years`
- `past_years` で全年分（2008年〜今年）を一括で出す機能を残す
  - 実際に 12〜13 年分の指定がある
  - Free の CPU 10ms に収めるため、描画を軽量な方式にする（スパイクで確定する）
- 描いた PNG を Cache API でキャッシュする
  - 内容が変わらない過去分は長期間、今年を含む画像は短期間キャッシュする
- `/robots.txt` と `/favicon.ico` をユーザー名として扱わず、専用の応答を返す
  - 現状は `robots.txt` がユーザー名として GitHub API を叩いている（566件）
- アクセスログを D1 に JSON で記録する
  - 新しいプライベートリポジトリ `swfz/cloudflare-import-dataform` の GH Actions → GCS → BigQuery（`kusa_image.cf_logs`）→ Dataform で取り込む。旧サービスのログ（`kusa_image.logs`）とは分ける
  - 現行より取れる項目を増やす: 国 / colo / ASN、UA の分類、キャッシュのヒット/ミス、描画時間、PNG のサイズ、GitHub API のレートリミットの残り、エラーの種類
  - IP は保存しない
- ホストは、既存の Cloudflare ゾーンのサブドメインにする（既存サービスの運用に合わせる）
- 段階的に移行する（旧サービス `swfz/deno-kusa-image` 側も作業する）
  - Phase 0: 新サービスを公開する（目標 2027-01 中）
  - Phase 1: 旧サービスを新ドメインへの 301 リダイレクトに切り替える。トップページと README に移転のお知らせを出す
  - Phase 2: 終了の約2か月前から、旧サービスは画像の凡例行の左側に移転先を書いた「案内入り画像」を返す（画像サイズは変えない）
  - Phase 3: Deno Deploy の終了とともに旧 URL は使えなくなる
- **BREAKING**: ホスト名が `kusa-image.swfz.deno.net` から新しいサブドメインに変わる（パスとパラメータは互換）

### 未決事項（スパイクで決める）

- **描画方式**
  - 本命: 自前でラスタライズする indexed PNG（矩形を直接描く + ビルド時に生成したビットマップフォント + `CompressionStream`）
  - 比較対象: SVG → resvg-wasm
  - 判断材料:
    - 全年分（14年、670x1960px 相当）が Free の CPU 10ms に収まるか
    - 文字の見た目の差（今の画像と並べた比較画像で判断する）
- **CLI**
  - 本命: `cf` CLI（Wrangler の後継。現在 1.0.0-rc）
  - 次の2点に問題があれば Wrangler で始め、1.0 が出た後に `cf migrate` する
    - `cloudflare.config.ts` の構成でユニットテスト（vitest-pool-workers 等）と VRT（Playwright）が回るか
    - pnpm の cooldown と RC 版の更新頻度が両立するか
- **GitHub の認証方式**（→ 個人の PAT に決定。GitHub App は見送り。design.md 参照）
  - 当初の本命: GitHub App のインストールトークン
    - 個人の PAT はユーザー単位でレートリミット（GraphQL 5,000 pt/h）を共有するため、他の作業と枠を食い合う
    - 個人の PAT だとログの残量に他の利用が混ざり、このサービスの消費が見えない
  - 代替: マシンユーザー用アカウントの PAT、または今と同じ個人の PAT
  - 判断材料: 本人（swfz）の画像を個人の PAT と App のトークンで取得して比べ、プライベートなコントリビューションの扱いで合計値や日ごとのレベルが変わらないか

## Capabilities

### New Capabilities

- `contribution-image`: GitHub のコントリビューションを PNG 画像として返す HTTP エンドポイント。URL とパラメータの解釈、描画内容（サマリー文・曜日と月のラベル・凡例・テーマ・ハロウィン配色・複数年の表示）、存在しないユーザーへの応答、トップページ、`robots.txt` と `favicon.ico` の扱いを含む
- `image-cache`: 生成した画像と GitHub API の応答のキャッシュ。キャッシュキーの正規化、期間の扱い（過去分か今年を含むか）による TTL の使い分け
- `access-logging`: リクエストごとのアクセスログの記録項目、秘匿すべき情報の除外、保持期間、BigQuery 連携のためのエクスポート形式

### Modified Capabilities

（なし。このリポジトリには既存の spec がない）

## Impact

- **このリポジトリ（kusa-image）**: Workers のアプリケーション一式を新しく作る。対象は描画、GitHub GraphQL クライアント、キャッシュ、ログ、静的なトップページ、ユニットテスト、VRT
- **Cloudflare**: Workers（Free）、D1、Cache API、既存ゾーンのサブドメインを使う。GitHub の読み取り用トークンを Secret として登録する
- **swfz/deno-kusa-image**: Phase 1 のリダイレクトとお知らせ、Phase 2 の案内入り画像を追加する。終了後はアーカイブする
- **swfz/cloudflare-import-dataform（新規、プライベート）**: D1 のログを `kusa_image.cf_logs` に取り込むワークフローと Dataform のビューを作る
- **swfz/deno-logviewer-import-dataform**: 変更しない。Deno の終了とともにアーカイブする
- **既存の埋め込み利用者**: ホスト名の変更が必要。Phase 1〜2 の期間は旧 URL のまま動き、Phase 2 の間は画像に案内が出る
