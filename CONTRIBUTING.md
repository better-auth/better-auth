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

## Documentation

The documentation site lives in `docs/` and content is organized under `docs/content/docs/` by topic.

To run the docs locally:

```bash
pnpm -F docs dev
```

When making changes to public APIs, please update the relevant documentation.

## Issue Guidelines

Before opening an issue, search existing issues to avoid duplicates.
We provide templates to help you get started.

### Issue Triage

These labels communicate current maintainer intent and the next step to
contributors. Straightforward issues may be resolved directly without entering
this flow.

An issue is untriaged until it has a `needs:*` or `target:*` label. Once
triaged, it has exactly one label from either group:

| Label | Meaning |
| --- | --- |
| `needs: info` | More information is required from the reporter. |
| `needs: repro` | A minimal reproduction is required. |
| `needs: discussion` | Further discussion is required to align on scope or direction. |
| `target: patch` | Accepted and can ship in a patch release. |
| `target: minor` | Accepted and requires a minor release. |
| `target: major` | Accepted and requires a major release. |

```text
Untriaged
    │
    ▼
Triaged
    ├─ needs: info / repro / discussion
    └─ target: patch / minor / major
    │
    ▼
Completed
```

On a triaged issue, the absence of a `needs:*` label means maintainers are not
currently requesting additional information, a reproduction, or further
discussion. Labels may be added, changed, or removed as the issue evolves.

A `target:*` label identifies the smallest release category that can contain the
change. It does not indicate priority or commit the issue to the next matching
release after the label is applied or work begins. The change may ship in any
later matching release. A milestone identifies the version currently planned;
an assignee or linked pull request indicates active work.

### Bug Reports

Use the [bug report template](https://github.com/better-auth/better-auth/issues/new?template=bug_report.yml).
Provide a clear description of the bug with steps to reproduce and a minimal
reproduction.

### Feature Requests

New features start with discussion. Open a [feature request](https://github.com/better-auth/better-auth/issues/new?template=feature_request.yml) describing the problem, your proposed solution, and how it would benefit the project. This gives us room to align on scope and API shape before anyone writes code.

### Social Provider Integrations

New social providers that can be supported by the
[Generic OAuth plugin](https://www.better-auth.com/docs/plugins/generic-oauth)
default to a community-maintained helper. Better Auth prioritizes extensibility
over maintaining the details of every provider integration.
Adding a provider to this repository is an ongoing maintenance commitment and
requires Better Auth to commit to maintaining it.

| Integration | Criteria | Maintainer |
| --- | --- | --- |
| Built-in social provider | Broad use or provider-specific behavior beyond Generic OAuth | Better Auth |
| Built-in provider helper | Broad demand and supported by Generic OAuth | Better Auth |
| Community provider helper | Supported by Generic OAuth | Provider or community |

When a missing capability is provider-agnostic, prefer improving Generic OAuth
over adding provider-specific code.

Open a feature request before implementing a built-in social provider or
built-in provider helper. A vendor contribution or support in another auth
library may demonstrate demand, but does not by itself determine whether Better
Auth will maintain the integration.

Community helpers can be developed and published independently. They may be
submitted for listing in the
[Other Social Providers](https://www.better-auth.com/docs/authentication/other-social-providers#community-provider-helpers)
documentation. A listing must identify the package, repository, documentation,
maintainer, supported Better Auth versions, and relevant tests. Helpers must use
Better Auth's public APIs and document their callback URL, scopes, and token
endpoint authentication.

### Security Reports

Do not open a public issue for security vulnerabilities.
Report them via [GitHub Security Advisories](https://github.com/better-auth/better-auth/security/advisories/new) instead.
See [SECURITY.md](/SECURITY.md) for details.

## Pull Request Guidelines

> [!NOTE]
> Discuss new features and other large changes in an issue before implementation.
> Pull requests that introduce features before this discussion, or whose scope is
> too broad for effective review, may be closed without detailed review.
> In turn, the Better Auth team aims to participate in these community discussions
> promptly and provide clear direction, so contributors can avoid investing in
> work that may not align with the project.

### Code Formatting and Linting

[Lefthook](https://lefthook.dev/) runs linting, formatting, and spell checking
in parallel on every commit. Additional checks like dependency linting (knip),
type checking, and tests run in CI.

To skip a specific hook by command name, use `LEFTHOOK_EXCLUDE`:

```bash
LEFTHOOK_EXCLUDE=spell git commit -m "your message"
```

Run `pnpm typecheck` and make sure it passes before opening your PR.

### Branch Targeting

- **`main` is the stable track.** It ships bug fixes, security work, additive
  improvements, and behavior changes that do not require user action. New
  capabilities can land here too as long as they are well-tested, non-breaking,
  and safe to adopt immediately.
- **`next` is the beta track.** It ships new features, refactors, and breaking
  changes, after a beta cycle that gives users a window to adapt.

Automation moves PRs with `minor` or `major` changesets from `main` to `next`
for you.

### Changesets

PRs that touch `packages/**` need a changeset before they can be merged. Run
`pnpm changeset` when you're ready to submit, or update it during review if
your changes evolve. The CLI walks you through picking the affected packages,
a bump type, and a short user-facing description for the changelog. Commit
the generated file with your PR.

Pick the bump type based on user impact:

- **`patch`** for bug fixes and additive changes existing users don't need to know about.
- **`minor`** or **`major`** for anything existing users need to be aware of (see [Branch Targeting](#branch-targeting)).

A good description:

- Write for end users reading the changelog, not for the PR reviewer.
- Be clear and concise.
- Explain what changed, not a commit-style prefix (e.g. `fix:`, `feat:`).
- Describe the symptom users see, not the internal cause.

If you're not sure whether your change needs one, a maintainer will handle
it before merge.

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

## Following Up on Closed Issues and PRs

Closed issues and PRs are automatically locked after 7 days of inactivity
and tagged with the `locked` label. This keeps follow-ups from piling up
on stale threads, so any new context can be triaged on its own.

If you're hitting a similar problem or have new information, open a new
issue or PR and reference the locked one.

## AI Policy

We welcome AI-assisted contributions, whether code or issue reports, as long
as they solve a real problem. Code must follow our coding standards and
include appropriate tests and documentation. You should also review and
understand what you're submitting well enough to discuss it. PRs and issues
that do not meet these guidelines will be closed. AI can reduce implementation
effort, but it does not reduce the cost of review, long-term maintenance,
compatibility, or support. We prioritize changes that align with the project's
direction over the volume of code submitted.
