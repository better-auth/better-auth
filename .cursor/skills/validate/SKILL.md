---
name: validate
description: Validate a GitHub issue by reproducing it with unit or smoke tests. Use when the user provides a GitHub issue URL and asks to validate, reproduce, or confirm a bug report.
disable-model-invocation: true
---

# Validate

Reproduce and confirm a GitHub issue by writing failing tests. Do NOT fix the issue.

## Workflow

1. **Fetch the issue**: Use the GitHub CLI (`gh issue view <url>`) to read the issue title, body, and comments.
2. **Understand the claim**: Identify the expected vs actual behavior described by the reporter.
3. **Explore the codebase**: Locate the relevant source code, existing tests, and any related modules.
4. **Write a reproduction test**: Add a unit test or smoke test that fails, proving the issue is real. Follow the project's test conventions:
   - Use `getTestInstance()` from `better-auth/test` (never create a separate `createAuthClient()`)
   - Add a `@see` comment above the test with the issue URL
   - Place the test alongside existing tests for the affected module
5. **Run the test**: Execute it with `vitest path/to/test -t "<pattern>"` and confirm it fails as expected.
6. **If the test passes** (issue not reproducible): note this clearly in the validation result.

## Output

Return exactly these four sections:

### 1. Validation Result

State whether the issue is **confirmed** (test fails as described) or **not reproducible** (test passes). Include the test file path and the test command used.

### 2. Root Cause

Explain why the bug occurs at the code level. Reference specific files, functions, and line numbers.

### 3. Regression Source (?)

If identifiable, state which commit, PR, or change introduced the bug. If unknown, say so.

### 4. What the Fix Would Look Like

Describe the fix approach without implementing it. Reference the specific code that would change.

## Applying the Fix (when asked later)

When told to apply the fix:

1. Implement the fix.
2. Confirm the reproduction test now passes.
3. Run git hooks before committing: formatting, spell check, biome, etc. all run via Lefthook on commit.
4. **Do NOT link the original issue in the PR title or description. Ever.**
