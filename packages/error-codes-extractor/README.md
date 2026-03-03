# @better-auth/error-codes-extractor

A Rolldown plugin that extracts error code documentation from TypeScript files and generates comprehensive documentation in multiple formats.

## Features

- 📝 Extracts error codes from `defineErrorCodes()` calls
- 📖 Parses JSDoc comments with `@description` tag and markdown sections
- 🎯 Generates two output formats:
  - Single markdown file (`ERROR_CODES.md`)
  - Individual MDX files for documentation sites
- 🔄 Auto-categorizes errors by plugin/module
- ✨ Supports custom JSDoc tags for structured documentation

## Installation

```bash
pnpm add -D @better-auth/error-codes-extractor
```

## Usage

Add the plugin to your `tsdown.config.ts`:

```typescript
import { defineConfig } from "tsdown";
import { errorCodesExtractor } from "@better-auth/error-codes-extractor";

export default defineConfig({
  plugins: [
    // Generate individual MDX files for docs
    errorCodesExtractor({
      outputFormat: "docs",
      srcDir: "src",
      docsOutputDir: "../../docs/content/docs/reference/errors",
    }),

    // Optionally scan additional directories (e.g., core package)
    errorCodesExtractor({
      outputFormat: "docs",
      srcDir: "../core/src",
      docsOutputDir: "../../docs/content/docs/reference/errors",
    }),
  ],
});
```

## Documentation Format

Error codes should be documented using a single `@description` JSDoc tag followed by markdown sections:

```typescript
import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const MY_ERROR_CODES = defineErrorCodes({
  /**
   * @description Brief description of what this error means.
   *
   * ## Common Causes
   *
   * - Cause 1
   * - Cause 2
   * - Cause 3
   *
   * ## How to resolve
   *
   * - Solution 1
   * - Solution 2
   * - Solution 3
   *
   * ## Example
   *
   * ```typescript
   * // Code example showing when this error occurs
   * try {
   *   await someOperation();
   * } catch (error) {
   *   if (error.code === "MY_ERROR") {
   *     // Handle error
   *   }
   * }
   * ```
   */
  MY_ERROR: "My error message",
});
```

### Supported Sections

- **@description**: Brief explanation of the error (required)
- **## Common Causes**: Bullet list of typical scenarios
- **## How to resolve**: Actionable steps to fix the error
- **## Example**: Code examples with triple-backtick fences
- **## Debug**: Custom debugging tips (optional, defaults added if not provided)

## Configuration Options

### `srcDir`
- Type: `string`
- Default: `"src"`
- Description: Directory to scan for error code files

### `outputFile`
- Type: `string`
- Default: `"ERROR_CODES.md"`
- Description: Output filename for single markdown format

### `outputFormat`
- Type: `"single" | "docs"`
- Default: `"single"`
- Description: Output format
  - `"single"`: Generates one `ERROR_CODES.md` file
  - `"docs"`: Generates individual MDX files for each error

### `docsOutputDir`
- Type: `string`
- Default: `"docs/content/docs/reference/errors"`
- Description: Output directory for docs format

### `getCategoryFromPath`
- Type: `(filePath: string, constantName: string) => string`
- Description: Custom function to determine error category from file path

## Generated Output

### Single Format (`ERROR_CODES.md`)

```markdown
# Better Auth Error Codes

> **Last Updated:** 2026-01-30

---

## Admin

**Source:** `plugins/admin/error-codes.ts`

### `YOU_CANNOT_BAN_YOURSELF`

**Message:** You cannot ban yourself

**Description:** This error prevents an admin from banning their own account.

## Common Causes
- Admin attempts to ban themselves
```

### Docs Format (Individual MDX Files)

Each error gets its own MDX file (e.g., `you_cannot_ban_yourself.mdx`):

```mdx
---
title: YOU_CANNOT_BAN_YOURSELF
description: You cannot ban yourself
---

## What is it?

This error prevents an admin from banning their own account.

**Category:** Admin

## Common Causes

- Admin attempts to ban themselves

## How to resolve

- Have another admin perform the ban

## Debug

* Enable debug logging in Better Auth
* Check server logs for details
```

## Integration with Better Auth

This plugin is specifically designed for Better Auth's error code system but can be adapted for other projects using similar patterns.

### Current Coverage

- **Admin Plugin**: 20 error codes
- **Anonymous Plugin**: 5 error codes
- **API Key Plugin**: 22 error codes
- **Device Authorization**: 14 error codes
- **Email OTP**: 3 error codes
- **Captcha**: 6 error codes
- **Generic OAuth**: 9 error codes
- **Multi Session**: 1 error code
- **Organization**: 91 error codes
- **Phone Number**: 12 error codes
- **Two Factor**: 9 error codes
- **Username**: 8 error codes
- **Have I Been Pwned**: 1 error code
- **Core**: 55 error codes

**Total**: 218+ error codes documented

## License

MIT
