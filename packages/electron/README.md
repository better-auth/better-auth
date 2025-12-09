# Better Auth Electron Plugin

This plugin integrates Better Auth with Electron, allowing you to easily add authentication to your Electron applications.

## Installation

To get started, install the necessary packages:

```bash
# Using npm
npm install better-auth @better-auth/electron

# Using yarn
yarn add better-auth @better-auth/electron

# Using pnpm
pnpm add better-auth @better-auth/electron

# Using bun
bun add better-auth @better-auth/electron
```

You will also need to install `electron-store` for session and cookie storage in your Electron app:

```bash
npm install electron-store
# or
yarn add electron-store
# or
pnpm add electron-store
# or
bun add electron-store
```

We use Electron's `safeStorage` APIs to securely store sensitive data.

## Basic Usage

TODO: Add a basic usage example here.

## Documentation

For more detailed information and advanced configurations, please refer to the documentation:

- **Main Better Auth Installation:** [https://www.better-auth.com/docs/installation](https://www.better-auth.com/docs/installation)
- **Electron Integration Guide:** [https://www.better-auth.com/docs/integrations/electron](https://www.better-auth.com/docs/integrations/electron)

## License

MIT
