# Contributing Guide

Thank you for your interest in contributing to this project! This guide will help you understand our development practices and standards.

## Development Setup

1. **Install Dependencies**

   ```bash
   bun install
   ```

2. **Run Development Server**

   ```bash
   bun run dev
   ```

3. **Run Tests**
   ```bash
   bun test
   ```

## Code Style

- We use TypeScript with strict type checking
- Follow the existing code patterns and conventions
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions focused and single-purpose

## Testing

### Writing Tests

We use **Bun's built-in test runner** for all tests. All tests should be written in TypeScript and follow these conventions:

1. **Test File Naming**: Use `.test.ts` suffix (e.g., `errors.test.ts`)

2. **Test Structure**: Use `describe` blocks to group related tests

   ```typescript
   import { afterEach, beforeEach, describe, expect, it } from "bun:test"

   describe("FeatureName", () => {
     describe("methodName", () => {
       it("should do something specific", () => {
         // Test implementation
       })
     })
   })
   ```

3. **Test Coverage**: Aim for comprehensive coverage including:

   - Happy path scenarios
   - Error cases
   - Edge cases
   - Boundary conditions

4. **Test Organization**:

   - Group related tests with `describe` blocks
   - Use descriptive test names that explain what is being tested
   - Use `beforeEach` and `afterEach` for setup/teardown when needed

5. **Assertions**: Use Bun's `expect` API
   ```typescript
   expect(value).toBe(expected)
   expect(value).toEqual(expected)
   expect(value).toBeInstanceOf(Class)
   expect(() => function()).toThrow()
   ```

### Example Test Structure

```typescript
import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { MyClass } from "./my-class"

describe("MyClass", () => {
  describe("constructor", () => {
    it("should create instance with required properties", () => {
      const instance = new MyClass({ prop: "value" })
      expect(instance.prop).toBe("value")
    })
  })

  describe("methodName", () => {
    it("should handle success case", async () => {
      const result = await MyClass.methodName()
      expect(result).toBeDefined()
    })

    it("should throw error on failure", async () => {
      await expect(MyClass.methodName()).rejects.toThrow()
    })
  })
})
```

### Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run specific test file
bun test src/utils/errors.test.ts
```

## Error Handling

When creating new modules or endpoints, follow the custom error pattern:

1. **Create Error Classes**: Use `createErrorClasses` from `src/utils/errors.ts`

   ```typescript
   import { createErrorClasses } from "../../utils/errors"

   export const MyModuleErrors = createErrorClasses({
     NotFound: {
       message: "Resource not found",
       code: "RESOURCE_NOT_FOUND",
       status: 404,
     },
     CreateFailed: {
       message: "Failed to create resource",
       code: "RESOURCE_CREATE_FAILED",
       status: 500,
     },
   })
   ```

2. **Register Errors**: Register errors with Elysia

   ```typescript
   export const myModule = new Elysia({ prefix: "/my-module" })
     .error(MyModuleErrors)
     .onError(({ code, error }) => {
       if (error instanceof CustomError) {
         return error.toResponse()
       }
       // Handle other errors
     })
   ```

3. **Throw Errors**: Use the error classes in your business logic
   ```typescript
   if (!resource) {
     throw new MyModuleErrors.NotFound()
   }
   ```

## Database

- Use Drizzle ORM for all database operations
- Follow the schema patterns in `src/database/domains/`
- Always clean up test data in tests (use `beforeEach`/`afterEach`)
- Use transactions when appropriate

## API Design

- Follow RESTful conventions
- Use appropriate HTTP status codes
- Include proper validation schemas
- Document response types
- Handle errors consistently

## Pull Request Process

1. **Create a Branch**: Create a feature branch from `main`

   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make Changes**: Implement your changes following the guidelines above

3. **Write Tests**: Add tests for all new functionality

4. **Run Tests**: Ensure all tests pass

   ```bash
   bun test
   ```

5. **Check Linting**: Ensure there are no linting errors

6. **Commit Changes**: Write clear, descriptive commit messages

   ```bash
   git commit -m "feat: add new feature"
   ```

7. **Push and Create PR**: Push your branch and create a pull request

## Commit Message Format

We follow conventional commits:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Adding or updating tests
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

Example:

```
feat: add subscription error handling
test: add tests for subscription errors
fix: handle edge case in subscription creation
```

## Code Review

- All PRs require at least one approval
- Address review comments promptly
- Keep PRs focused and reasonably sized
- Update documentation as needed

## Questions?

If you have questions or need help, please open an issue or reach out to the maintainers.

Thank you for contributing! 🎉
