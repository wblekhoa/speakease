#!/usr/bin/env bash
# Publishes the landing page to https://wblekhoa.github.io/speakease/.
# Running this IS a deploy: run it only on the owner's "phát hành" (decisions.md, 2026-10-31).
# It enables GitHub Pages (Actions source) the first time, runs .github/workflows/pages.yml on main,
# waits for the run, then checks the live page answers.
set -euo pipefail
repo=wblekhoa/speakease
url=https://wblekhoa.github.io/speakease/

git fetch -q origin main
if ! git cat-file -e origin/main:site/package.json 2>/dev/null; then
  echo "site/ is not on main yet: fast-forward main to the landing branch first (site/README.md, Publishing)." >&2
  exit 1
fi

if ! gh api "repos/$repo/pages" >/dev/null 2>&1; then
  gh api -X POST "repos/$repo/pages" -f build_type=workflow >/dev/null
  echo "GitHub Pages enabled (source: GitHub Actions)."
fi

before=$(gh run list -R "$repo" --workflow pages.yml -L 1 --json databaseId -q '.[0].databaseId // 0')
gh workflow run pages.yml -R "$repo" --ref main
run=$before
for _ in $(seq 30); do
  run=$(gh run list -R "$repo" --workflow pages.yml -L 1 --json databaseId -q '.[0].databaseId // 0')
  [ "$run" != "$before" ] && break
  sleep 2
done
[ "$run" != "$before" ] || { echo "The Pages run did not start." >&2; exit 1; }
gh run watch "$run" -R "$repo" --exit-status

curl -fsS -o /dev/null "$url" && curl -fsS -o /dev/null "${url}en/"
echo "Live: $url and ${url}en/"
