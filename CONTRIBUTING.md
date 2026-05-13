# Contributing to Better Auth

Thank you for your interest in contributing to Better Auth.  
Your contributions help improve the project for everyone.

Before contributing, please read our [Code of Conduct](CODE_OF_CONDUCT.md).

---

# Contribution Workflow

Most contributions follow this process:

```text
1. Fork the repository
2. Clone it locally
3. Install dependencies
4. Create a new branch
5. Make your changes
6. Add or update tests
7. Run checks and type validation
8. Create a changeset (if needed)
9. Commit your changes
10. Open a pull request
```

---

# Repository Setup

## 1. Fork and Clone the Repository

Fork the repository on GitHub, then clone your fork locally:

```bash
git clone https://github.com/your-username/better-auth.git
cd better-auth
```

---

## 2. Install Node.js

This project recommends the latest LTS version of Node.js.

We use [nvm](https://github.com/nvm-sh/nvm) to manage local Node.js versions.

Once installed, run:

```bash
nvm install
nvm use
```

Alternatively, you can install Node.js manually from the official website.

---

## 3. Install pnpm

This project uses [pnpm](https://pnpm.io/) for package management.

Install it globally:

```bash
npm install -g pnpm
```

> [!NOTE]
> This repository is configured to use Corepack, which can automatically install the correct pnpm version.

---

## 4. Install Dependencies

Run:

```bash
pnpm install
```

This installs all required project dependencies.

---

## 5. Build the Project

Before making changes, confirm the project builds successfully:

```bash
pnpm build
```

---

# Development Workflow

## Create a Branch

Create a new branch before starting work:

```bash
git checkout -b fix/my-feature
```

Example branch names:

```text
fix/session-bug
feat/google-provider
docs/setup-guide
```

---

# Testing

All bug fixes and new features should include tests.

---

## Run All Tests

```bash
pnpm test
```

---

## Run Specific Tests

Example:

```bash
pnpm vitest packages/better-auth/src/plugins/organization --run
```

This helps speed up development when working on a specific area.

---

# Unit Tests

Use `getTestInstance()` from `better-auth/test` when creating unit tests.

Example:

```typescript
import { getTestInstance } from "better-auth/test";

const { client, auth } = await getTestInstance({
  plugins: [organization()],
});
```

This creates an isolated authentication test environment.

---

# Database Adapter Tests

Some adapter tests require Docker containers.

Start the containers before running adapter tests:

```bash
docker compose up -d
```

> [!IMPORTANT]
> On macOS, the MSSQL container requires:
>
> - Rosetta emulation
> - At least 2 GB of allocated Docker memory

---

# End-to-End Tests

E2E tests are located in the `e2e/` directory.

The project includes three E2E suites:

- smoke
- adapter
- integration

These tests validate real application behavior.

---

# Regression Tests

When fixing a GitHub issue, include a regression test whenever possible.

Use a `@see` comment to reference the original issue:

```typescript
/**
 * @see https://github.com/better-auth/better-auth/issues/1234
 */
it("should handle the previously broken behavior", async () => {
  // test implementation
});
```

This helps future contributors understand why the test exists.

---

# Documentation

Documentation files are located in:

```text
docs/content/docs/
```

Run the documentation site locally:

```bash
pnpm -F docs dev
```

> [!IMPORTANT]
> If you change public APIs, update the related documentation as part of your PR.

---

# Issue Guidelines

Before opening a new issue:

- Search existing issues first
- Avoid duplicate reports
- Use the provided issue templates

---

## Bug Reports

Use the bug report template when reporting issues.

A good bug report should include:

- clear description
- reproduction steps
- expected behavior
- actual behavior
- minimal reproduction

---

## Feature Requests

New features should begin with a discussion.

Open a feature request describing:

- the problem
- your proposed solution
- expected benefits
- possible API design

This helps maintainers review and align on the implementation before development begins.

---

## Security Reports

Do not create public issues for security vulnerabilities.

Instead, contact:

```text
security@better-auth.com
```

See [SECURITY.md](SECURITY.md) for more information.

---

# Pull Request Guidelines

> [!NOTE]
> For large features, please open an issue first before starting development.

---

## Before Opening a PR

Make sure:

- tests pass
- type checking passes
- documentation is updated
- changes are properly scoped

Run type checking:

```bash
pnpm typecheck
```

---

# Formatting and Linting

The project uses [Lefthook](https://lefthook.dev/) to run:

- linting
- formatting
- spell checking

These checks run automatically during commits.

Skip a specific hook if necessary:

```bash
LEFTHOOK_EXCLUDE=spell git commit -m "your message"
```

---

# Branch Targeting

## `main`

The `main` branch is the stable release track.

Use it for:

- bug fixes
- security fixes
- safe improvements
- non-breaking changes

---

## `next`

The `next` branch is used for:

- breaking changes
- large refactors
- experimental features

PRs with `minor` or `major` changesets are automatically moved to `next`.

---

# Changesets

If your PR modifies anything inside `packages/**`, you will usually need a changeset.

Generate one using:

```bash
pnpm changeset
```

A changeset:

- updates package versions
- generates changelog entries
- describes user-facing changes

Commit the generated changeset file with your PR.

---

## Choosing a Version Type

### Patch

Use for:

- bug fixes
- internal improvements
- small safe changes

### Minor

Use for:

- new features
- changes users should know about

### Major

Use for:

- breaking changes
- incompatible API updates

---

# Commit Message Format

Pull request titles must follow [Conventional Commits](https://www.conventionalcommits.org/).

Examples:

```text
feat(auth): add GitHub OAuth provider
fix(cli): resolve Windows build issue
docs: improve installation instructions
chore: update dependencies
```

Rules:

- use lowercase subjects
- keep titles concise
- append `!` for breaking changes

Example:

```text
feat(api)!: redesign session handling
```

---

# Pull Request Description

Your PR description should include:

- what changed
- why it changed
- related issues
- breaking changes
- screenshots (for UI changes)

Example:

```text
Closes #1234
```

---

# AI Contribution Policy

AI-assisted contributions are welcome.

However:

- contributors must understand the submitted code
- code must follow project standards
- tests are required
- documentation may be required

Low-quality or unreviewed AI-generated submissions may be rejected.

---

# Common Problems

## `pnpm` Command Not Found

Install pnpm globally:

```bash
npm install -g pnpm
```

---

## Docker Tests Failing

Make sure:

- Docker Desktop is running
- containers are started

```bash
docker compose up -d
```

---

## Type Errors During Build

Run:

```bash
pnpm typecheck
```

Fix all TypeScript errors before opening a PR.

---

# Final Checklist

Before submitting your PR, confirm:

- [ ] Project builds successfully
- [ ] Tests pass
- [ ] Type checking passes
- [ ] Documentation is updated
- [ ] Changeset added (if required)
- [ ] PR title follows Conventional Commits
- [ ] PR targets the correct branch