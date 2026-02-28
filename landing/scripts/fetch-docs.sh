#!/bin/bash
# Fetches docs and blog content from better-auth/better-auth repo
# Runs before fumadocs-mdx to ensure content is available at build time

set -e

REPO="https://github.com/better-auth/better-auth.git"
CONTENT_DIR="content"
TEMP_DIR=".tmp-docs-fetch"

# ─── Fetch a single branch ──────────────────────────────────────────────────────
# Usage: fetch_branch <branch> <docs_dest>
fetch_branch() {
  local branch="$1"
  local docs_dest="$2"

  echo "Fetching docs from branch '$branch'..."

  rm -rf "$TEMP_DIR"
  git clone --depth 1 --filter=blob:none --sparse --branch "$branch" "$REPO" "$TEMP_DIR" 2>/dev/null
  cd "$TEMP_DIR"
  git sparse-checkout set docs/content docs/components
  cd ..

  rm -rf "$docs_dest"
  mkdir -p "$docs_dest"
  cp -r "$TEMP_DIR/docs/content/docs/." "$docs_dest/"

  # Copy blog content only from the main branch
  if [ "$branch" = "main" ]; then
    rm -rf "$CONTENT_DIR/blogs"
    mkdir -p "$CONTENT_DIR"
    cp -r "$TEMP_DIR/docs/content/blogs" "$CONTENT_DIR/blogs"

    # Copy doc-specific components referenced by MDX files
    DOC_COMPONENTS=(
      "community-plugins-table.tsx"
      "resource-section.tsx"
      "resource-card.tsx"
    )
    for comp in "${DOC_COMPONENTS[@]}"; do
      if [ -f "$TEMP_DIR/docs/components/$comp" ]; then
        cp "$TEMP_DIR/docs/components/$comp" "components/$comp"
      fi
    done

    # Rewrite relative image paths in blog frontmatter to absolute URLs
    DOCS_SITE="https://www.better-auth.com"
    for mdx in "$CONTENT_DIR/blogs"/*.mdx; do
      if [ -f "$mdx" ]; then
        tmp_file="${mdx}.tmp"
        sed "s|^image: \"/|image: \"${DOCS_SITE}/|" "$mdx" > "$tmp_file" && mv "$tmp_file" "$mdx"
      fi
    done
  fi

  rm -rf "$TEMP_DIR"
  echo "Branch '$branch' fetched into $docs_dest."
}

# ─── Main ────────────────────────────────────────────────────────────────────────

fetch_branch "main" "$CONTENT_DIR/docs"
fetch_branch "canary" "$CONTENT_DIR/docs-canary"

echo "All docs content fetched successfully."
