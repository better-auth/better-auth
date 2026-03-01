#!/bin/bash
# Links local docs content from the repository root docs/ directory
# Runs before fumadocs-mdx to ensure content is available at build time

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LANDING_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$LANDING_DIR")"
CONTENT_DIR="$LANDING_DIR/content"
DOCS_SOURCE="$REPO_ROOT/docs/content"

cd "$LANDING_DIR"

mkdir -p "$CONTENT_DIR"

rm -rf "$CONTENT_DIR/docs" "$CONTENT_DIR/docs-canary" "$CONTENT_DIR/blogs"

ln -s "$DOCS_SOURCE/docs" "$CONTENT_DIR/docs"
ln -s "$DOCS_SOURCE/docs" "$CONTENT_DIR/docs-canary"
ln -s "$DOCS_SOURCE/blogs" "$CONTENT_DIR/blogs"

echo "Docs content linked successfully from $DOCS_SOURCE"
