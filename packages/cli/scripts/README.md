# Plugin Config Generator

This script automatically generates CLI plugin configuration files from TypeScript type definitions in the Better Auth plugin system. It uses static analysis to extract plugin options marked with special JSDoc tags and generates type-safe configuration files for the CLI's `init` command.

## Purpose

Instead of manually maintaining plugin configuration files that define CLI flags, prompts, validation schemas, and import paths, this script generates them automatically by analyzing the plugin's TypeScript type definitions. This ensures:

- **Single source of truth**: Plugin options are defined once in the plugin's type file
- **Type safety**: Generated configs match the actual plugin types
- **Maintainability**: Changes to plugin options automatically propagate to CLI configs
- **Consistency**: All plugin configs follow the same structure and conventions

## How It Works

1. **Reads plugin type definitions** from `better-auth/src/plugins/`
2. **Extracts properties** marked with `@cli` JSDoc tags
3. **Generates Zod schemas** for validation based on TypeScript types
4. **Creates CLI argument configurations** with flags, descriptions, prompts, and defaults
5. **Handles nested objects** by resolving type references (including `Omit<>` utility types)
6. **Generates formatted TypeScript files** for each plugin and an index file

## Supported JSDoc Tags

When defining plugin options in your type files, use these JSDoc tags to control CLI behavior:

### `@cli`

Marks a property as exposed in the CLI. Required for any property that should be configurable.

```typescript
/**
 * The issuer name for TOTP
 * @cli
 */
issuer?: string;
```

### `@cli skip`

Excludes a property from CLI generation, even if it has `@cli`.

```typescript
/**
 * Internal property not exposed to CLI
 * @cli skip
 */
internal?: string;
```

### `@cli required`

Marks a property as required in the CLI.

```typescript
/**
 * Required configuration option
 * @cli required
 */
apiKey: string;
```

### `@cli select`

Indicates this property should be rendered as a select dropdown. Works with union types (string literals) or you can provide custom options.

**Automatic extraction from union types:**
```typescript
/**
 * Choose the OTP method
 * @cli select
 */
method: "totp" | "sms" | "email";
```

**Custom options override:**
You can override the options by providing them after `@cli select`. Format options as space-separated values, optionally with labels using `value:Label` syntax.

```typescript
/**
 * Choose the authentication method
 * @cli select google:Google OAuth github:GitHub OAuth email:Email Password
 */
method?: string;
```

Or with simple values (labels will be auto-generated):
```typescript
/**
 * Choose the OTP method
 * @cli select totp sms email
 */
method?: string;
```

### `@cli multi-select`

Similar to `@cli select`, but allows selecting multiple values. The property will receive a comma-separated string of selected values.

**With union types:**
```typescript
/**
 * Choose multiple OTP methods
 * @cli multi-select
 */
methods: ("totp" | "sms" | "email")[];
```

**With custom options:**
```typescript
/**
 * Select multiple providers
 * @cli multi-select google:Google OAuth github:GitHub OAuth email:Email Password
 */
providers?: string;
```

### `@type <primitive>`

Overrides the Zod schema type inference. Only supports primitive types: `string`, `number`, `boolean`. Useful when the TypeScript type is complex but you want a simple schema.

```typescript
/**
 * Custom property with complex type
 * @cli
 * @type string
 */
customProperty?: SomeComplexType;
```

**Supported types:**
- `string` → `z.coerce.string()`
- `number` → `z.coerce.number()`
- `boolean` → `z.coerce.boolean()`
- `enum` → `z.enum([...])` (requires enum values)

### `@type enum <values>`

Generates a Zod enum schema with the specified values. Values should be space-separated.

```typescript
/**
 * Choose the authentication method
 * @cli
 * @type enum google github email
 */
method?: string;
```

This will generate: `z.enum(["google", "github", "email"])`

### Automatic Question Generation

Questions are automatically generated based on the property type if no `@question` tag is provided:

- **Boolean types**: `Would you like to <property name>?`
  - Example: `enableFeature?: boolean` → `Would you like to enable feature?`
- **Number types**: `What is the <property name>?`
  - Example: `timeout?: number` → `What is the timeout?`
- **String/Other types**: `What is the <property name>?`
  - Example: `apiKey?: string` → `What is the api key?`

The `@type` override also affects question generation. For example, `@type boolean` will generate a "Would you like to..." question even if the TypeScript type is something else.

### `@prompt`

Marks a property to show an interactive prompt in the CLI. By default, properties without `@prompt` will skip prompts and use defaults/flag values.

```typescript
/**
 * Enter your API key
 * @cli
 * @prompt
 */
apiKey?: string;
```

### `@default <value>`

Sets a default value for the property. Supports strings, numbers, and booleans.

```typescript
/**
 * Timeout in seconds
 * @cli
 * @default 30
 */
timeout?: number;
```

### `@question <text>`

Customizes the prompt question text. If not provided, a question is auto-generated based on the property type (see [Automatic Question Generation](#automatic-question-generation)).

```typescript
/**
 * The OAuth provider name
 * @cli
 * @question Which OAuth provider do you want to use?
 */
provider?: string;
```

## Usage

Run the script from the repository root:

```bash
# Using pnpm
pnpm --filter @better-auth/cli tsx scripts/generate-plugin-config.ts

# Or using tsx directly
tsx packages/cli/scripts/generate-plugin-config.ts
```

The script will:
1. Process all plugins defined in `PLUGIN_TYPE_MAP`
2. Generate individual config files: `plugin-<kebab-case-name>.config.ts`
3. Generate an index file: `plugins-index.config.ts`

## Generated Files

### Individual Plugin Config

Each plugin gets a file like `plugin-two-factor.config.ts`:

```typescript
export const twoFactorPluginConfig = {
  displayName: "Two Factor",
  auth: {
    function: "twoFactor",
    imports: [...],
    arguments: [
      {
        flag: "two-factor-issuer",
        description: "The issuer name for TOTP",
        question: "What is the issuer?",
        argument: {
          isProperty: "issuer",
          schema: z.coerce.string().optional(),
        },
      },
      // ... more arguments
    ],
  },
  authClient: { ... } | null,
} as const satisfies PluginConfig;
```

### Index File

The `plugins-index.config.ts` file exports all plugin configs:

```typescript
export const pluginsConfig = {
  twoFactor: twoFactorPluginConfig,
  // ... other plugins
} as const satisfies Record<string, PluginConfig>;
```

## Adding a New Plugin

To add a new plugin to the generator:

1. **Add the plugin to `PLUGIN_TYPE_MAP`**:

```typescript
const PLUGIN_TYPE_MAP = {
  // ... existing plugins
  myPlugin: {
    serverTypeFile: pluginPath("my-plugin/types.ts"),
    serverTypeName: "MyPluginOptions",
    clientTypeFile: pluginPath("my-plugin/client.ts"), // optional
    clientTypeName: undefined, // optional
    importPath: "better-auth/plugins", // optional, defaults to this
  },
};
```

2. **Add `@cli` tags** to properties in your plugin's type file:

```typescript
export interface MyPluginOptions {
  /**
   * Configuration option description
   * @cli
   * @prompt
   * @default "default-value"
   */
  option?: string;
}
```

3. **Run the generator** to create the config files

4. **Import and use** the generated config in your CLI code

## Type Handling

The script handles various TypeScript types:

- **Primitive types**: `string`, `number`, `boolean` → Zod schemas
- **Union types**: String literal unions → `z.enum()` or `z.coerce.string()`
- **Optional types**: `type | undefined` → `.optional()` schema
- **Nested objects**: Resolves type references like `OTPOptions`, `Config` types
- **Omit utility**: Handles `Omit<Type, "property">` and skips omitted properties
- **Type aliases & interfaces**: Supports both `interface` and `type` declarations

## Limitations

- Maximum nesting depth of 3 levels
- Only processes properties with `@cli` tag
- Type references must be resolvable within the project
- Complex generic types may not be fully supported

## Output Location

Generated files are written to:
```
packages/cli/src/commands/init/configs/
```

- `plugin-<name>.config.ts` - Individual plugin configs
- `plugins-index.config.ts` - Combined index file

