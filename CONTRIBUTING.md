# Contributing to Better Auth

Hi, we really appreciate your interest in contributing to Better Auth. This guide will help you get started. Your contributions make Better Auth even better for everyone. Before you begin, please take a moment to review the following guidelines.

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Repository Setup

1. Fork the repository and clone it locally:

   ```bash
   git clone https://github.com/your-username/better-auth.git
   cd better-auth
   ```

2. Install Node.js (LTS version recommended)

   > **Note**: This project is configured to use
   > [nvm](https://github.com/nvm-sh/nvm) to manage the local Node.js version,
   > as such this is the simplest way to get you up and running.

   Once installed, use:

   ```bash
   nvm install
   nvm use
   ```

   Alternatively, see
   [Node.js installation](https://nodejs.org/en/download) for other supported
   methods.

3. Install [pnpm](https://pnpm.io/)

   > **Note:** This project is configured to manage [pnpm](https://pnpm.io/) via
   > [corepack](https://github.com/nodejs/corepack).
   > Once installed, upon usage you’ll be prompted to install the correct pnpm
   > version

   Alternatively, use `npm` to install it:

   ```bash
   npm install -g pnpm
   ```

4. Install project dependencies:

   ```bash
   pnpm install
   ```

5. Build the project:

   ```bash
   pnpm build
   ```

## Documentation

The documentation site lives in `docs/` and content is organized under `docs/content/docs/` by topic.

To run the docs locally:

```bash
pnpm -F docs dev
```

When making changes to public APIs, please update the relevant documentation.

## Testing

Bug fixes and new features must include tests.

Run the full test suite:

```bash
pnpm test
```

Or filter by file or directory:

```bash
pnpm vitest packages/better-auth/src/plugins/organization --run
```

### Unit Tests

Use `getTestInstance()` from `better-auth/test` to set up test instances:

```typescript
import { getTestInstance } from "better-auth/test";

const { client, auth } = await getTestInstance({
  plugins: [organization()],
});
```

### Database Adapter Tests

Adapter tests require Docker containers. Start them before running adapter tests:

> **Note:** On macOS, the MSSQL container requires Rosetta emulation and at
> least 2 GB of allocated memory.

```bash
docker compose up -d
```

### E2E Tests

End-to-end tests live in `e2e/` and are split into three suites: smoke, adapter,
and integration.

### Regression Tests

When writing a test for a specific GitHub issue, add a `@see` comment:

```typescript
/**
 * @see https://github.com/better-auth/better-auth/issues/1234
 */
it("should handle the previously broken behavior", async () => {
  // ...
});
```

## Issue Guidelines

Before opening an issue, search existing issues to avoid duplicates.
We provide templates to help you get started.

### Bug Reports

Use the [bug report template](https://github.com/better-auth/better-auth/issues/new?template=bug_report.yml).
Provide a clear description of the bug with steps to reproduce and a minimal
reproduction.

### Feature Requests

New features start with discussion. Open a [feature request](https://github.com/better-auth/better-auth/issues/new?template=feature_request.yml) describing the problem, your proposed solution, and how it would benefit the project. This gives us room to align on scope and API shape before anyone writes code.

### Security Reports

Do not open a public issue for security vulnerabilities.
Email [security@better-auth.com](mailto:security@better-auth.com) instead.
See [SECURITY.md](/SECURITY.md) for details.

## Pull Request Guidelines

> [!NOTE]
> For new features, please open an issue first to discuss before moving forward. We do not review large feature PRs opened without going through an issue first.

### Code Formatting and Linting

A pre-commit hook automatically checks and fixes staged files when you commit
using [Biome](https://biomejs.dev/).

Run `pnpm typecheck` and make sure it passes before opening your PR.

### AI Policy

We welcome AI-assisted contributions as long as they solve a real problem.
The code must follow our coding standards and include appropriate tests and
documentation. You should also review and understand your changes well enough
to discuss them with reviewers. PRs that do not meet these guidelines will be closed.

### Changesets

PRs that touch `packages/**` need a changeset before they can be merged. Run
`pnpm changeset` when you're ready to submit, or update it during review if
your changes evolve. The CLI walks you through picking the affected packages,
a bump type, and a short user-facing description for the changelog. Commit
the generated file with your PR.

Pick the bump type based on user impact:

- **`patch`** for bug fixes and additive changes existing users don't need to know about.
- **`minor`** or **`major`** for anything existing users need to be aware of (see [Branch Targeting](#branch-targeting) below).

If you're not sure whether your change needs one, a maintainer will handle
it before merge.

### Branch Targeting

- **`main` is the stable track.** It ships bug fixes, security work, additive
  improvements, and behavior changes that do not require user action. New
  capabilities can land here too as long as they are well-tested, non-breaking,
  and safe to adopt immediately.
- **`next` is the beta track.** It ships new features, refactors, and breaking
  changes, after a beta cycle that gives users a window to adapt.

Automation moves PRs with `minor` or `major` changesets from `main` to `next`
for you.

### Submitting a PR

1. Open a pull request against the **`main`** branch.

2. PR titles must follow the [Conventional Commits](https://www.conventionalcommits.org/)
   format, with an optional scope for the affected package or feature:

   ```
   `feat(scope): description` or
   `fix(scope): description` or
   `perf: description` or
   `docs: description` or
   `chore: description` etc.
   ```

   - The subject must start with a lowercase letter.
   - Use `docs` when changes are confined to `docs/`.
   - Append `!` for breaking changes (e.g. `feat(scope)!: description`). These go through `next`, not `main`.

3. In your PR description:
   - Clearly describe what you changed and why
   - Reference related issues (e.g. "Closes #1234")
   - List any potential breaking changes
   - Add screenshots for UI changes
