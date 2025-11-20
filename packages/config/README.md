# @better-auth/config

Shared configuration utilities for the better-auth monorepo.

## Vitest Configuration

This package exports a shared Vitest configuration that enables source file resolution during testing.

### Usage

Import the shared configuration in your `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import { sharedVitestConfig } from "@better-auth/config/vitest";

export default defineConfig({
  ...sharedVitestConfig,
  test: {
    // your test configuration
  },
});
```

Or with `defineProject`:

```typescript
import { defineProject } from "vitest/config";
import { sharedVitestConfig } from "@better-auth/config/vitest";

export default defineProject({
  ...sharedVitestConfig,
  test: {
    // your test configuration
  },
});
```

### What it does

The shared configuration includes:

- **SSR Resolution**: Configures Vitest to resolve modules using the `"dev-source"` condition, which allows tests to run against TypeScript source files instead of built JavaScript files.

This eliminates the need to duplicate the SSR configuration across all vitest config files in the monorepo.
