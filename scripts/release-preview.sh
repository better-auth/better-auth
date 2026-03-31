#!/bin/bash
#
# Release Preview Script
#
# Shows what will be included in the next release by comparing
# the current branch against the last stable release tag.
#
# Handles the cherry-pick history gap where stable tags may not
# be direct ancestors of the current branch (reverse cherry-pick model).
#
# Breaking changes are detected via the `breaking` label on merged PRs
# (using GitHub CLI), not just the `!` marker in commit messages.
#
# Usage:
#   ./scripts/release-preview.sh              # auto-detect last stable tag
#   ./scripts/release-preview.sh v1.5.6       # specify base tag explicitly

set -euo pipefail

BRANCH="origin/main"
BASE_TAG="${1:-}"

# --- Detect base tag ---

if [ -z "$BASE_TAG" ]; then
  BASE_TAG=$(git tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
  if [ -z "$BASE_TAG" ]; then
    echo "Error: no stable tag found (vX.Y.Z format)"
    exit 1
  fi
fi

echo "Base tag: $BASE_TAG"
echo "Branch:   $BRANCH"
echo ""

# --- Check if tag is a direct ancestor ---

if git merge-base --is-ancestor "$BASE_TAG" "$BRANCH" 2>/dev/null; then
  MODE="direct"
  echo "Mode: direct (tag is ancestor of branch)"
  echo ""
  RANGE="$BASE_TAG..$BRANCH"
else
  MODE="cherry-pick"
  MERGE_BASE=$(git merge-base "$BASE_TAG" "$BRANCH")
  echo "Mode: cherry-pick (tag is NOT ancestor of branch)"
  echo "  Common ancestor: $(git log -1 --oneline "$MERGE_BASE")"
  echo ""
  echo "  Some commits may have been cherry-picked into $BASE_TAG."
  echo "  Filtering by PR number to exclude already-released changes."
  echo ""
  RANGE="$MERGE_BASE..$BRANCH"
fi

# --- Collect commits ---

# Extract PR numbers using the GitHub merge commit pattern: (#NNN)
# This avoids false positives from issue references like "closes #999"
extract_prs() {
  grep -Eo '\(#[0-9]+\)' | grep -Eo '[0-9]+' | sort -u
}

if [ "$MODE" = "direct" ]; then
  ALL_COMMITS=$(git log "$RANGE" --oneline)
else
  TAG_PRS=$(git log "$BASE_TAG" --oneline | extract_prs)
  BRANCH_PRS=$(git log "$RANGE" --oneline | extract_prs)

  # comm requires sorted input; extract_prs already sorts
  # Use printf to avoid empty string producing a blank line
  NEW_PRS=$(comm -23 <(printf '%s\n' $BRANCH_PRS) <(printf '%s\n' $TAG_PRS))

  ALL_COMMITS=$(git log "$RANGE" --oneline | while IFS= read -r line; do
    pr=$(echo "$line" | grep -Eo '\(#[0-9]+\)' | grep -Eo '[0-9]+' | head -1)
    if [ -z "$pr" ]; then
      echo "$line"
    elif printf '%s\n' $NEW_PRS | grep -q "^${pr}$"; then
      echo "$line"
    fi
  done)
fi

# --- Detect breaking changes via PR labels ---

echo "Checking merged PRs for 'breaking' label..."

PR_NUMBERS=$(echo "$ALL_COMMITS" | grep -Eo '\(#[0-9]+\)' | grep -Eo '[0-9]+' | sort -u)

BREAKING_LINES=""
BREAKING_PR_NUMS=""
for pr_num in $PR_NUMBERS; do
  result=$(gh pr view "$pr_num" --repo better-auth/better-auth --json labels,title \
    --jq '(.labels | map(.name) | join(",")) + "\t" + .title' 2>/dev/null || true)
  if echo "$result" | grep -q 'breaking'; then
    title=$(echo "$result" | cut -f2)
    BREAKING_LINES="${BREAKING_LINES}
#${pr_num} ${title}"
    BREAKING_PR_NUMS="${BREAKING_PR_NUMS} ${pr_num}"
  fi
done

# Also detect breaking changes from commit message ! marker (e.g. feat!:, fix!(scope):)
BANG_COMMITS=$(echo "$ALL_COMMITS" | grep -E '^[a-f0-9]+ \w+!(\(|:)' || true)
if [ -n "$BANG_COMMITS" ]; then
  while IFS= read -r line; do
    pr=$(echo "$line" | grep -Eo '\(#[0-9]+\)' | grep -Eo '[0-9]+' | head -1)
    # Skip if already captured via PR label
    if [ -n "$pr" ] && echo "$BREAKING_PR_NUMS" | grep -q " ${pr}\b"; then
      continue
    fi
    BREAKING_LINES="${BREAKING_LINES}
${line}"
    if [ -n "$pr" ]; then
      BREAKING_PR_NUMS="${BREAKING_PR_NUMS} ${pr}"
    fi
  done <<< "$BANG_COMMITS"
fi

# Trim leading newline
BREAKING_LINES=$(echo "$BREAKING_LINES" | sed '/^$/d')

echo ""

# --- Categorize ---

# Exclude commits that belong to breaking PRs from feat/fix
NON_BREAKING_COMMITS="$ALL_COMMITS"
for bp in $BREAKING_PR_NUMS; do
  NON_BREAKING_COMMITS=$(echo "$NON_BREAKING_COMMITS" | grep -vE "#${bp}([^0-9]|$)" || true)
done
# Also exclude ! marker commits without PR numbers
NON_BREAKING_COMMITS=$(echo "$NON_BREAKING_COMMITS" | grep -vE '^[a-f0-9]+ \w+!(\(|:)' || true)

FEATS=$(echo "$NON_BREAKING_COMMITS" | grep -E '^[a-f0-9]+ feat' || true)
FIXES=$(echo "$NON_BREAKING_COMMITS" | grep -E '^[a-f0-9]+ fix' || true)
CHORES=$(echo "$ALL_COMMITS" | grep -E '^[a-f0-9]+ chore' || true)
DOCS=$(echo "$ALL_COMMITS" | grep -E '^[a-f0-9]+ docs' || true)
CI=$(echo "$ALL_COMMITS" | grep -E '^[a-f0-9]+ ci' || true)
OTHER=$(echo "$ALL_COMMITS" | sed '/^$/d' | grep -vE '^[a-f0-9]+ (feat|fix|chore|docs|ci)' || true)

count() {
  local input="$1"
  if [ -z "$input" ]; then
    echo 0
  else
    echo "$input" | sed '/^$/d' | grep -c . 2>/dev/null || echo 0
  fi
}

TOTAL=$(count "$ALL_COMMITS")
FEAT_COUNT=$(count "$FEATS")
FIX_COUNT=$(count "$FIXES")
BREAKING_COUNT=$(count "$BREAKING_LINES")

# --- Summary ---

echo "========================================"
echo "  Release Preview: $BASE_TAG -> v?.?.?"
echo "========================================"
echo ""
echo "  Total new commits:  $TOTAL"
echo "  Features:           $FEAT_COUNT"
echo "  Bug fixes:          $FIX_COUNT"
echo "  Breaking changes:   $BREAKING_COUNT"
echo ""

if [ "$BREAKING_COUNT" -gt 0 ]; then
  echo "  Suggested version: MINOR (breaking changes found)"
elif [ "$FEAT_COUNT" -gt 0 ]; then
  echo "  Suggested version: MINOR (new features)"
else
  echo "  Suggested version: PATCH (fixes only)"
fi

echo ""

# --- Detail ---

if [ "$BREAKING_COUNT" -gt 0 ]; then
  echo "## Breaking Changes"
  echo ""
  echo "$BREAKING_LINES" | sed 's/^/  /'
  echo ""
fi

if [ -n "$FEATS" ]; then
  echo "## Features"
  echo ""
  echo "$FEATS" | sed 's/^/  /'
  echo ""
fi

if [ -n "$FIXES" ]; then
  echo "## Bug Fixes"
  echo ""
  echo "$FIXES" | sed 's/^/  /'
  echo ""
fi

if [ -n "$DOCS" ]; then
  echo "## Docs ($(count "$DOCS"))"
  echo ""
  echo "  (use --verbose to list)"
  echo ""
fi

if [ -n "$CHORES" ]; then
  echo "## Chores ($(count "$CHORES"))"
  echo ""
  echo "  (use --verbose to list)"
  echo ""
fi

if [ -n "$OTHER" ]; then
  echo "## Other"
  echo ""
  echo "$OTHER" | sed 's/^/  /'
  echo ""
fi
