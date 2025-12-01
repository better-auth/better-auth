# Contributing to Better Auth

Thank you for your interest in contributing to Better Auth. This guide will help you get started with the contribution process.

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](/CODE_OF_CONDUCT.md) By participating, you are expected to uphold this code.

## Project Structure

The Better Auth monorepo is organized as follows:

- `/packages/better-auth` - Core authentication library
- `/packages/cli` - Command-line interface tools
- `/packages/expo` - Expo integration
- `/packages/stripe` - Stripe payment integration
- `/packages/sso` - SSO plugin with SAML and OIDC support
- `/docs` - Documentation website
- `/examples` - Example applications
- `/demo` - Demo applications

## Development Guidelines

When contributing to Better Auth:

- Keep changes focused. Large PRs are harder to review and unlikely to be accepted. We recommend opening an issue and discussing it with us first.
- Ensure all code is type-safe and takes full advantage of TypeScript features.
- Write clear, self-explanatory code. Use comments only when truly necessary.
- Maintain a consistent and predictable API across all supported frameworks.
- Follow the existing code style and conventions.
- We aim for stability, so avoid changes that would require users to run a migration or update their config...

## Getting Started

1. Fork the repository to your GitHub account
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/better-auth.git
   cd better-auth
   ```
3. Install Node.js (LTS version recommended)

   > **Note**: This project is configured to use [nvm](https://github.com/nvm-sh/nvm) to manage the local Node.js version, as such this is simplest way to get you up and running.

   Once installed, use:

   ```bash
   $ nvm install
   $ nvm use
   ```

   Alternatively, see Node.js [installation](https://nodejs.org/en/download) for other supported methods.

4. Install `pnpm` if you haven't already:

   > **Note:** This project is configured to manage [pnpm](https://pnpm.io/) via [corepack](https://github.com/nodejs/corepack). Once installed, upon usage you'll be prompted to install the correct pnpm version

   Alternatively, use `npm` to install it:

   ```bash
   npm install -g pnpm
   ```
5. Install project dependencies:
   ```bash
   pnpm install
   ```

6. Create a `.env` file from the example:
   - On Unix-based systems:
     ```bash
     cp -n ./docs/.env.example ./docs/.env
     ```
   - On Windows:
     ```cmd
     copy /Y .\docs\.env.example .\docs\.env
     ```

7. Build the project:
   ```bash
   pnpm build
   ```

8. Run the documentation locally:
   ```bash
   pnpm -F docs dev
   ```


## Code Formatting with BiomeJS

We use [BiomeJS](https://biomejs.dev/) for code formatting and linting. Before committing, please ensure your code is properly formatted:

```bash
# Format all code
pnpm format

# Check for linting issues
pnpm lint

# Fix auto-fixable issues
pnpm lint:fix
```

## Development Workflow

1. Create a new branch for your changes:
   ```bash
   git checkout -b type/description
   # Example: git checkout -b feat/oauth-provider
   ```
   
   Branch type prefixes:
   - `feat/` - New features
   - `fix/` - Bug fixes
   - `docs/` - Documentation changes
   - `refactor/` - Code refactoring
   - `test/` - Test-related changes
   - `chore/` - Build process or tooling changes

2. Make your changes following the code style guidelines
3. Add tests for your changes
4. Run database containers (needed for testing database adapters)
   ```bash
   docker compose up -d
   ```

   > Note: On MacOS, the **mssql** container will likely require Rosetta emulation and at least 2GB of RAM of allocated memory. See their [container requirements](https://learn.microsoft.com/en-us/sql/linux/quickstart-install-connect-docker?view=sql-server-ver17&tabs=cli&pivots=cs1-bash#prerequisites).

5. Run the test suite:
   ```bash
   # Run all tests
   pnpm test
   
   # Run tests for a specific package
   pnpm -F "{package_name}" test
   ```
6. Ensure all tests pass and the code is properly formatted
7. Commit your changes with a descriptive message following this format:
   For changes that need to be included in the changelog (excluding docs or chore changes), use the `fix` or `feat` format with a specific scope:
   ```
   fix(organization): fix incorrect member role assignment
   
   feat(two-factor): add support for TOTP authentication
   ```

   For core library changes that don't have a specific plugin or scope, you can use `fix` and `feat` without a scope:
   ```
   fix: resolve memory leak in session handling
   
   feat: add support for custom error messages
   ```

   For documentation changes, use `docs`:
   ```bash
   docs: improve authentication flow explanation
   docs: fix typos in API reference
   ```
   
   For changes that refactor or don't change the functionality of the library or docs, use `chore`:
   ```bash
   chore(refactor): reorganize authentication middleware
   chore: update dependencies to latest versions
   ```

   Each commit message should be clear and descriptive, explaining what the change does. For features and fixes, include context about what was added or resolved.
8. Push your branch to your fork
9. Open a pull request against the **canary** branch. In your PR description:
   - Clearly describe what changes you made and why
   - Include any relevant context or background
   - List any breaking changes or deprecations
   - Add screenshots for UI changes
   - Reference related issues or discussions

## Testing

All contributions must include appropriate tests. Follow these guidelines:

- Write unit tests for new features
- Ensure all tests pass before submitting a pull request
- Update existing tests if your changes affect their behavior
- Follow the existing test patterns and structure
- Test across different environments when applicable

## Pull Request Process

1. Create a draft pull request early to facilitate discussion
2. Reference any related issues in your PR description (e.g., 'Closes #123')
3. Ensure all tests pass and the build is successful
4. Update documentation as needed
5. Keep your PR focused on a single feature or bug fix
6. Be responsive to code review feedback
7. Update the CHANGELOG.md if your changes are user-facing

## Code Style

- Follow the existing code style
- Use TypeScript types and interfaces effectively
- Keep functions small and focused
- Use meaningful variable and function names
- Add comments for complex logic
- Update relevant documentation when making API changes
- Follow the BiomeJS formatting rules
- Avoid using Classes

## Component-Specific Guidelines

### Core Library (`/packages/better-auth`)
- Keep the core library focused on essential authentication functionality
- Plugins in the core generally are made by core members. If you have a plugin idea consider open sourcing it yourself instead. 
- Ensure all public APIs are well-documented with JSDoc comments
- Maintain backward compatibility. If it's super necessary, provide a clear migration path
- Follow the existing patterns for error handling and logging

### Documentation (`/docs`)

- Keep documentation up-to-date with code changes
- Use clear, concise language
- Include code examples for common use cases
- Document any breaking changes in the migration guide
- Follow the existing documentation style and structure

## Security Issues

For security-related issues, please email security@better-auth.com. Include a detailed description of the vulnerability and steps to reproduce it. All reports will be reviewed and addressed promptly. For more information, see our [security documentation](/docs/reference/security).