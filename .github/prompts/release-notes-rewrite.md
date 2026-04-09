<!-- Prompt structure adapted from sst/opencode (MIT, Copyright (c) 2025 opencode) -->
<!-- https://github.com/anomalyco/opencode — .opencode/command/changelog.md -->

You are rewriting release notes for better-auth, an open-source
authentication framework for TypeScript.

## Input files

**Raw changelog:** __RAW_CHANGELOG_PATH__
Each entry is a one-line PR title followed by a PR link, grouped by npm
package and change type (Breaking Changes, Features, Bug Fixes).

**Changeset context (optional):** __CONTEXT_PATH__
A JSON file mapping PR numbers to their full changeset descriptions.
Use these descriptions as background context to write better titles —
they explain the motivation and details behind each change. If the file
path is "none" or does not exist, skip this step.

## Your job

Rewrite every entry title into a polished, user-focused one-liner.
The raw titles are conventional commit messages (e.g.,
`fix(next-js): replace cookie probe with header-based RSC detection`).
Transform them into clean descriptions that tell users what changed
for them.

## Writing rules

Rewriting titles:
- Remove conventional commit prefixes (`fix(scope):`, `feat:`, etc.)
- Replace with a past-tense verb describing the change type:
  "Fixed …", "Added …", "Improved …", "Refactored …", "Removed …"
- Keep it to one sentence — this is a summary, not a paragraph
- Describe the user-visible impact, not the internal code change
- Wrap code identifiers in backticks: function names, config keys,
  field names, type names (e.g., `nextCookies()`, `twoFactorMethods`)
- Do NOT wrap general concepts in backticks ("password hashing" stays plain)
- If a title is unclear, read the changeset context for that PR number,
  or inspect the diff: `gh pr diff <N> --repo __GITHUB_REPOSITORY__ | head -200`
- Remove duplicate PR number suffixes from the title text (the PR
  link in parentheses already provides this)

Breaking changes:
- Entries under `### ❗ Breaking Changes` need a migration note
- Rewrite the title the same way (past-tense, user-focused)
- The raw output may include indented changeset details below the title
  line; replace them with a single concise blockquote:
  `> **Migration:** <what changed and what users need to do>`
- Inspect the PR diff (`gh pr diff <N>`) to find the exact migration action
- If there is a config opt-out, show it in an inline code span
- Keep migration notes concise (1-3 lines max)
- Example:
  ```
  Before (raw):
  - feat(sso)!: enable InResponseTo validation by default for SAML flows ([#8736](url))
    ...indented changeset description...

  After (rewritten):
  - Enabled InResponseTo validation by default for SP-initiated SAML flows ([#8736](url))
  > **Migration:** Set `sso({ saml: { enableInResponseToValidation: false } })` to restore the previous behavior.
  ```

## Structural rules (do NOT violate)

- Do NOT add or remove entries
- Do NOT modify PR links `([#NNNN](url))`
- Do NOT modify `## \`package-name\`` headings or their order
- Do NOT modify `### ❗ Breaking Changes`, `### Features`, or
  `### Bug Fixes` sub-headings or their order
- Do NOT modify the `CHANGELOG` links at the end of each package section
- Do NOT add author attributions (`by @username`)
- Do NOT use em dashes (—); use commas, colons, or parentheses
  (exception: the " — " separator after breaking change titles is allowed)
- Keep the blog post link, contributors section, and full changelog
  link exactly as-is
- Each entry stays on one line (title + PR link), except breaking
  changes which get an additional blockquote line for migration

Write the final release notes to: __RAW_CHANGELOG_PATH__.final
