<!-- Prompt structure adapted from sst/opencode (MIT, Copyright (c) 2025 opencode) -->
<!-- https://github.com/anomalyco/opencode — .opencode/command/changelog.md -->

You are rewriting release notes for better-auth, an open-source
authentication framework for TypeScript.

Read the raw changelog at: __RAW_CHANGELOG_PATH__

This raw changelog was generated from git history and PR metadata.
Each entry has a description and a PR link.
Entries are grouped by npm package (`better-auth`, `@better-auth/sso`,
etc.), then by change type (`Breaking Changes`, `Features`, `Bug Fixes`).

Entries come from two sources:
- Changeset descriptions (may already look clean but often need tense
  fixes, code formatting, and user-focus adjustments)
- Raw commit subjects (lower-case, terse, may include PR number
  suffixes like "(#8289)" in the description text)

Your job is to rewrite EVERY description so the changelog reads as a
polished, consistent document written for end users.

For entries that are unclear or too terse, inspect the actual PR diff
to understand what really changed:
  gh pr diff <PR_NUMBER> --repo __GITHUB_REPOSITORY__ | head -200

## Writing rules

Tense and voice:
- Use past tense consistently throughout ("Added", "Fixed", "Removed")
- Never mix tenses ("Added X and improve Y" is wrong, use "Added X and improved Y")
- Never use imperative/present ("Add", "Fix", "Remove")

Code references:
- Wrap code identifiers in backticks: function names, method names,
  option names, config keys, field names, type names, package names
  (e.g., `storeSessionInDatabase`, `provisionUserOnEveryLogin`, `auth_time`)
- Do NOT wrap general concepts in backticks (e.g., "password hashing" stays plain)

User focus:
- The changelog is for users who are at least slightly technical (they
  use the library and want to know what changed for them)
- Describe the impact on users, not the internal code change
- "Fixed a bug where sessions expired immediately after creation" is better
  than "Aligned session fresh age calculation with creation time"
- "Password hashing no longer blocks the server during sign-up" is better
  than "Used non-blocking scrypt for password hashing"
- If a change is behavioral (affects what users experience), lead with the behavior
- Be thorough in understanding flow-on effects that may not be immediately
  apparent: a package upgrade that looks internal may patch a user-facing
  bug; a refactor may stabilize a race condition that caused intermittent
  failures; a dependency bump may change minimum supported versions
- When inspecting a diff, look at the PR title and body for the author's
  context (the outcome they intended, not just the technical detail)

Breaking changes:
- Entries prefixed with `**BREAKING:**` must be transformed into a rich format:
  1. Replace the `**BREAKING:**` prefix with a bold title extracted from the description
  2. Add " — " after the title, followed by user-focused context
  3. Keep the PR link at the end of the description line
  4. Below the description, add a code block showing the migration action
     (the opt-out config, the before/after import change, or the new required option)
  5. Inspect the PR diff (`gh pr diff <N>`) to find the exact migration action
- Example transformation:
  ```
  Before (raw):
  **BREAKING:** enable InResponseTo validation by default for SAML flows ([#8736](url))

  After (rewritten):
  **SAML InResponseTo validation enabled by default** — `enableInResponseToValidation` is now `true` for SP-initiated SAML flows ([#8736](url)). To restore the previous behavior:

  ```ts
  sso({ saml: { enableInResponseToValidation: false } })
  ```
  ```

## Structural rules (do NOT violate)

- Do NOT add or remove entries; keep every entry from the raw changelog
- Do NOT modify PR links `([#NNNN](url))`
- Do NOT modify the `## \`package-name\`` headings or their order
- Do NOT modify the `### ⚠️ Breaking Changes`, `### Features`, or
  `### Bug Fixes` sub-headings or their order within a package
- Do NOT add author attributions (`by @username`) to entries
- Do NOT use em dashes (—); use parentheses, commas, or colons instead
  (exception: the " — " separator in breaking change titles is allowed)
- Keep the blog post link, contributors section, and full changelog
  link exactly as-is
- Remove duplicate PR number suffixes from description text (the PR
  link in parentheses already provides this; e.g., change
  "fixed foo (#8289)" to "Fixed foo")
- Do NOT duplicate an entry across multiple sub-sections; each entry
  appears exactly once under the change type it was classified as

Write the final release notes to: __RAW_CHANGELOG_PATH__.final
