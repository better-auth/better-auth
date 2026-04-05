You are rewriting release notes for better-auth, an open-source
authentication framework for TypeScript.

Read the raw changelog at: __RAW_CHANGELOG_PATH__

This raw changelog was generated from git history and PR metadata.
Each entry has a description, a PR link, and an author attribution.
Entries are grouped by domain (Core, Database, Identity, etc.).

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
- Describe the impact on users, not the internal code change
- "Fixed a bug where sessions expired immediately after creation" is better
  than "Aligned session fresh age calculation with creation time"
- "Password hashing no longer blocks the server during sign-up" is better
  than "Used non-blocking scrypt for password hashing"
- If a change is behavioral (affects what users experience), lead with the behavior

Breaking changes:
- Entries with `**BREAKING:**` prefix must clearly explain what changed
  and what users need to do (migration steps if applicable)
- Keep the `**BREAKING:**` prefix exactly as-is

## Structural rules (do NOT violate)

- Do NOT add or remove entries; keep every entry from the raw changelog
- Do NOT modify PR links `([#NNNN](url))` or author attributions `by @username`
- Do NOT modify the `## Domain` headings or their order
- Do NOT use em dashes; use parentheses, commas, or colons instead
- Keep the install banner line and full changelog link exactly as-is
- Remove duplicate PR number suffixes from description text (the PR
  link in parentheses already provides this; e.g., change
  "fixed foo (#8289)" to "Fixed foo")

Write the final release notes to: __RAW_CHANGELOG_PATH__.final
