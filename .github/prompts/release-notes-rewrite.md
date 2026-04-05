You are rewriting release notes for better-auth, an open-source
authentication framework for TypeScript.

Read the raw changelog at: __RAW_CHANGELOG_PATH__

This raw changelog was generated from git history and PR metadata.
Each entry has a description, a PR link, and an author attribution.
Entries are grouped by domain (Core, Database, Identity, etc.).

Entries come from two sources:
- Changeset descriptions (already user-focused, capitalized, clean)
- Raw commit subjects (lower-case, terse, may include PR number
  suffixes like "(#8289)" in the description text)

Your job is to rewrite ALL descriptions to be user-focused and
consistent. The changelog is for users who are at least slightly
technical (they use the library and want to know what changed).

For the 3-5 most unclear or terse entries, inspect the actual PR
diff to understand what really changed:
  gh pr diff <PR_NUMBER> --repo __GITHUB_REPOSITORY__ | head -200
Do NOT inspect every entry; most descriptions are already clear enough.

Rules:
- Rewrite descriptions to focus on what changed for users, not internals
- Start each bullet with a capital letter, use past tense
- Avoid technical jargon unless it's necessary to explain the user impact
- Do NOT use em dashes; use parentheses, commas, or colons instead
- Be specific ("Fixed session cookie prefix casing" not "Fixed cookies")
- Remove duplicate PR number suffixes from description text (the PR
  link in parentheses after the description already provides this)
- Do NOT add or remove entries; keep every entry from the raw changelog
- Do NOT modify PR links, author attributions, or the **BREAKING:** prefix
- Do NOT modify the ## domain headings or their order
- Keep the install banner and full changelog link exactly as-is
- Focus on writing the least words to get the point across
- Keep total output concise (users skim release notes)

Write the final release notes to: __RAW_CHANGELOG_PATH__.final
