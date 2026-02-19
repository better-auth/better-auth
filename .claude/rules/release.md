# Release Process

## Stable Release (to `main` branch)

1. **Create a staging branch** from the `main` branch:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b v1.x.x-staging  # e.g., v1.4.14-staging
   ```

2. **Cherry-pick commits** from `canary` branch:
   ```bash
   git cherry-pick <commit-hash>
   # Repeat for each commit you want to include
   ```

3. **Open a Pull Request** targeting the `main` branch

4. **Wait for CI** to pass (all checks must be green)

5. **Rebase and merge** the PR to `main` branch

6. **Bump version and create tag**:
   ```bash
   git checkout main
   git pull origin main
   pnpm bump  # Interactive prompt to select version, creates commit & tag, automatically pushes
   ```

7. The release workflow (`.github/workflows/release.yml`) will automatically:
   * Generate changelog using `changelogithub`
   * Build all packages
   * Publish to npm with the `latest` tag

## Beta Release (on `canary` branch)

Beta versions are released from the `canary` branch:

```bash
git checkout canary
pnpm bump  # Select a beta version (e.g., v1.4.15-beta.0)
git push origin canary --follow-tags
```

The release workflow will publish to npm with the `beta` tag.

## Version Branch Releases

For maintaining older versions (e.g., v1.3.x while v1.4.x is latest):

1. Create a version branch named `v1.3.x-latest`
2. Tags pushed from this branch will also receive the `latest` npm tag

## Cherry-picking Guidelines

When cherry-picking from `canary` to a stable release branch:

### API Compatibility

* **Check for new APIs**: Commits may use APIs that do not exist in the
  target branch
* **Fix imports**: Some imports may need adjustment

### Handling Conflicts

* When resolving merge conflicts, keep **both** versions if they add
  different tests/features (e.g., two separate `describe` blocks)
* For type conflicts, check if new type properties need to be added
  to existing interfaces

### Skip Incompatible Commits

Skip commits that depend on features not in the target branch

### Squashing Fixes

**Never create separate compatibility fix commits.**
Always squash fixes into the original cherry-picked commit:

```bash
# Create fixup commit
git add <files>
git commit --fixup <original-commit-hash> --no-verify

# Squash with autosquash (repeat for all fixup commits first)
GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash <earliest-commit>^ --no-verify
```

### Revert Chains

When cherry-picking a sequence like: fix → revert → revert-of-revert,
just cherry-pick the original fix and skip both reverts (net effect
is the same).

### Test Verification

After cherry-picking, always run:

```bash
pnpm typecheck
pnpm lint
pnpm vitest <affected-test-files> --run
```

Remove tests that test features are not available in the target branch.

## Notes

* **Do not merge breaking changes to `main` branch** unless upgrading
  minor versions (e.g., 1.4 to 1.5)
* **Merge conflicts**: Resolve them carefully.
  Review each conflict to ensure no code is accidentally removed or
  duplicated
* **Keep the release branch clean**: Do not create extra commits on
  the releasing branch.
  If you need to fix CI issues, squash the fix into the appropriate
  existing commit
* All releases are triggered by pushing tags matching `v*`
* The CI determines the npm tag based on:
  * Pre-release suffix in tag name (canary, beta, rc, next)
  * Whether the commit is on `main` or a version branch (`v*.*.x-latest`)
* Always ensure CI is green before creating release tags
