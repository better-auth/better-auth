#!/bin/bash

# Check if commit message starts with release or docs prefix
if [[ ! "$message" == "chore(release): version packages"* ]] && [[ ! "$message" == "docs"* ]]; then
    echo "Skipping build: Not a release or docs commit."
    exit 1
fi