<p align="center">
  <picture>
    <source srcset="./banner-dark.png" media="(prefers-color-scheme: dark)">
    <source srcset="./banner.png" media="(prefers-color-scheme: light)">
    <img src="./banner.png" alt="Better Auth Logo">
  </picture>
  <h2 align="center">
    Better Auth
  </h2>

  <p align="center">
    The most comprehensive authentication library for TypeScript
    <br />
    <a href="https://better-auth.com"><strong>Learn more »</strong></a>
    <br />
    <br />
    <a href="https://discord.com/invite/GYC3W7tZzb">Discussions</a>
    ·
    <a href="https://better-auth.com">Website</a>
    ·
    <a href="https://github.com/better-auth/better-auth/issues">Issues</a>
  </p>
</p>

[![npm](https://img.shields.io/npm/dm/better-auth)](https://www.npmjs.com/package/better-auth)
[![GitHub stars](https://img.shields.io/github/stars/better-auth/better-auth)](https://github.com/better-auth/better-auth/stargazers)

> **Note:** 🚧 This project is currently in beta. Features and APIs may change.

## About the Project

### Why Better Auth?

> Auth feels like a partially solved problem in the ecosystem. Existing open-source libraries often require a lot of additional code for anything beyond a simple login. Third-party services, while convenient, comes with their own set of problems. And obviously, these services aren't free and can get really expensive. 

> Better auth is born out of these frustrations. It aims to provides a comprehensive authentication library from the core accompanied by a growings plugin ecosystem, that allows you to add many auth related features in short amount of time.


### Goals
****

- **Be Comprehensive**: Save users from reinventing the wheel for anything related auth.
- **Prioritize Best Practices**: provide best practices rather than overwhelming configuration options.
- **Framework Agnostic**: Support most frameworks and avoid framework specific features and solutions if possible.
- **Consistency**: Provide a consistent and predictable API across all platforms
- **Type Safety**: Value type-safety and embrace typescript magic when necessary.

### Non-Goals
****

- **JWT-Based Authentication**: We won’t support JWT-based auth unless provided by a third-party plugin.
- **Support for Non-Relational Databases**: No plans to support MongoDB or other non-relational databases.
- **Deep Customization**: Our focus is on delivering opinionated, best-practice defaults, rather than enabling deep customization.
- **Frontend UI Components**: We don’t provide frontend UI components. However, feel free to use our examples for quick UI integration.

> Some of these non-goals might change after we hit v1

## Contribution

Better Auth is free and open source project licensed under the [MIT License](./LICENSE.md). You are free to do whatever you want with it.

You could help continuing its development by:

- [Contribute to the source code](./CONTRIBUTING.md)
- [Suggest new features and report issues](https://github.com/better-auth/better-auth/issues)

## Security
If you discover a security vulnerability within Better AUth, please send an e-mail to support at better-auth.com.

All reports will be promptly addressed, and you'll be credited accordingly.