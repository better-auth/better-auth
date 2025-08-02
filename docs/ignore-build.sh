#!/bin/bash

# Get the latest commit message
if ! message=$(git log -1 --pretty=%s 2>/dev/null); then
    echo "Failed to check commit message" >&2
    exit 1
fi

# Check if commit message starts with release or docs prefix
if [[ ! "$message" == "chore(release): version packages"* ]] && [[ ! "$message" == "docs"* ]]; then
    echo "Skipping build: Not a release or docs commit."
    exit 0
fi 