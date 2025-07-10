# Contributing to Better Auth

Thank you for your interest in contributing to Better Auth. This guide will help you get started with the contribution process.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Security Issues](#security-issues)
- [Project Structure](#project-structure)
- [Development Guidelines](#development-guidelines)
- [Getting Started](#getting-started)
- [Code Formatting with BiomeJS](#code-formatting-with-biomejs)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Component-Specific Guidelines](#component-specific-guidelines)
  - [Core Library](#core-library)
  - [Documentation](#documentation)
  - [Plugins](#plugins)
  - [Examples](#examples)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## Security Issues

For security-related issues, please email security@better-auth.com. Include a detailed description of the vulnerability and steps to reproduce it. All reports will be reviewed and addressed promptly. For more information, see our [security documentation](/docs/reference/security).

## Project Structure

The Better Auth monorepo is organized as follows:

- `/packages/better-auth` - Core authentication library
- `/packages/cli` - Command-line interface tools
- `/packages/expo` - Expo integration
- `/packages/stripe` - Stripe payment integration
- `/docs` - Documentation website
- `/examples` - Example applications
- `/demo` - Demo applications

## Development Guidelines

When contributing to Better Auth, please keep these principles in mind:

- Provide opinionated, best-practice defaults rather than extensive configurations
- Maintain a consistent and predictable API across all supported frameworks
- Ensure all code is type-safe and leverages TypeScript features effectively
- Write clear, self-documenting code with appropriate comments
- Follow existing code style and patterns
- Keep changes focused and well-documented


## Prerequisites

Before you start development, ensure you have the following:

- Node.js LTS (latest version recommended)
- pnpm package manager
- Git
- (Optional) Any authentication provider accounts you plan to work with (Google, GitHub, etc.)
- (Optional) Database server if working with database-related features

## Getting Started

1. Fork the repository to your GitHub account
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/better-auth.git
   cd better-auth
   ```
3. Install Node.js (LTS version recommended)
4. Install pnpm if you haven't already:
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
4. Run the test suite:
   ```bash
   # Run all tests
   pnpm test
   
   # Run tests for a specific package
   pnpm --filter "{packagename}" test
   ```
5. Ensure all tests pass and the code is properly formatted
6. Commit your changes with a descriptive message following the [Conventional Commits](https://www.conventionalcommits.org/) format:
   ```
   type(scope): description
   
   [optional body]
   
   [optional footer(s)]
   ```
7. Push your branch to your fork
8. Open a pull request against the main branch

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

## Component-Specific Guidelines

### Core Library (`/packages/better-auth`)

- Keep the core library focused on essential authentication functionality
- Add new authentication methods as plugins when possible
- Ensure all public APIs are well-documented with JSDoc comments
- Maintain backward compatibility or provide a clear migration path
- Follow the existing patterns for error handling and logging

### Documentation (`/docs`)

- Keep documentation up-to-date with code changes
- Use clear, concise language
- Include code examples for common use cases
- Document any breaking changes in the migration guide
- Follow the existing documentation style and structure

### Plugins

- Keep plugins focused on a single responsibility
- Follow the naming convention `@better-auth/plugin-name`
- Document all configuration options and requirements
- Include TypeScript type definitions
- Add tests for all plugin functionality
- Document any required setup or dependencies

### Examples (`/examples` and `/demo`)

- Keep examples simple and focused
- Include a README with setup instructions
- Document any prerequisites or setup steps
- Keep dependencies up to date
- Ensure examples follow security best practices
