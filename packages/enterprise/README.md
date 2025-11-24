# Enterprise Service

Enterprise SaaS platform service built with Elysia and Bun.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed (latest version)

### Installation

```bash
bun install
```

## Development

### Start Development Server

```bash
bun run dev
```

The server will start on http://localhost:3001 (check `src/index.ts` for the port).

### Run Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test:watch
```

## Project Structure

```
src/
├── database/          # Database schemas and configuration
│   ├── domains/       # Domain-specific table definitions
│   └── utils.ts       # Database utilities
├── modules/           # Feature modules
│   ├── subscriptions/ # Subscription management
│   └── organizations/ # Organization management
├── utils/             # Shared utilities
│   └── errors.ts      # Custom error handling
└── index.ts           # Application entry point
```

## Testing

We use Bun's built-in test runner. All tests should be written in TypeScript with the `.test.ts` suffix.

### Writing Tests

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed testing guidelines.

Example:

```typescript
import { describe, expect, it } from "bun:test"

describe("Feature", () => {
  it("should work correctly", () => {
    expect(true).toBe(true)
  })
})
```

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## Error Handling

This project uses a custom error handling system. See `src/utils/errors.ts` for details.

All modules should:

1. Create error classes using `createErrorClasses`
2. Register errors with Elysia
3. Handle errors in `.onError()` hook
4. Throw custom errors in business logic

## License

[Add your license here]
