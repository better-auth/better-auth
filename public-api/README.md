# Public API Reports

This directory contains auto-generated API surface reports for all published packages. These files serve as the **baseline** for detecting breaking changes — any modification to the public API will cause CI to fail until the reports are updated.

## How it works

1. `pnpm build` generates `.d.mts` / `.d.ts` declaration files
2. `api-extractor` analyzes every typed export in each package
3. The result is compared against the existing `.api.md` files in this directory
4. If there is a difference, CI fails

## Commands

```bash
# Check for API changes (runs in CI)
pnpm public-api:check

# Check a single package
pnpm public-api:check --pkg stripe

# Update reports after intentional changes
pnpm public-api:update

# Update a single package
pnpm public-api:update --pkg stripe
```

## When CI fails

1. Review the diff shown in the CI output
2. If the change is intentional, run `pnpm public-api:update` locally
3. Commit the updated `.api.md` files — reviewers will see the API diff in the PR

## Directory structure

```
public-api/
├── api-extractor.json          # Shared config (messages, compiler options)
├── api-extractor.run.ts        # Script (auto-discovers packages, runs in parallel)
├── better-auth/
│   ├── index.api.md            # "." export
│   ├── client.api.md           # "./client" export
│   ├── plugins/
│   │   ├── organization.api.md # "./plugins/organization" export
│   │   └── ...
│   └── ...
├── core/
│   ├── index.api.md
│   └── ...
└── ...
```

The folder structure mirrors the `exports` field from each package's `package.json`. New packages are automatically discovered — no manual configuration needed.
