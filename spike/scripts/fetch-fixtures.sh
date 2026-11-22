#!/usr/bin/env bash
# swfz の contributionCalendar を期間ごとに spike/fixtures/ へ保存する（スパイク用）
set -euo pipefail
USER_NAME="${1:-swfz}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/fixtures"
QUERY='query($user:String! $from:DateTime $to:DateTime){user(login:$user){contributionsCollection(from:$from,to:$to){contributionCalendar{totalContributions colors isHalloween weeks{contributionDays{color contributionCount contributionLevel date}}}}} rateLimit{cost remaining resetAt}}'

gh api graphql -f query="$QUERY" -f user="$USER_NAME" > "$OUT/default.json"
for y in $(seq 2008 "$(date +%Y)"); do
  gh api graphql -f query="$QUERY" -f user="$USER_NAME" -f from="${y}-01-01T00:00:00Z" -f to="${y}-12-31T23:59:59Z" > "$OUT/year-${y}.json"
done
# isHalloween はリクエスト時点で決まるため実データでは再現できない。default を元に isHalloween=true にした合成 fixture を作る
jq '.data.user.contributionsCollection.contributionCalendar.isHalloween = true' "$OUT/default.json" > "$OUT/halloween-synthetic.json"
# 存在しないユーザー
gh api graphql -f query="$QUERY" -f user="no-such-user-xyz-kusa" > "$OUT/not-found.json" 2>/dev/null || true
