# Contributing to Better Auth

Thanks for taking the time to improve Better Auth! This is a small document to get you started. Before submitting a new issue or PR, check if it already exists in issues or PRs.

### Areas you can contribute

**Issues**

Probably the best way to get going is to see if there is open issues acknowledged by the team. Feel free to open an issue if you found a bug or a missing feature you'd like to work on, and there aren't any issues mentioning it.


**Framework Integrations**

We aim to support as many frameworks as possible in the JavaScript ecosystem. If you'd like to integrate one we don't already cover, start by adding documentation. Since the core is designed to be flexible, a simple doc should work for most frameworks. If we believe the integration should go further to reduce friction, we might ask you to contribute or handle it ourselves.

In general, we avoid framework-specific solutions unless it's a thin layer, especially on the server side. If there's a way to make it work without tying it to a specific framework, and it still works well, we'd prefer that.

Right now, everything you need—framework integrations, plugins, and all the necessary glue code—is bundled into a single package. Since our current integrations are minimal, we don’t plan on splitting them into separate packages for the time being.

**Plugins**

If you plan to contribute a new core plugin open an issue first. If we see fit with the plans we have in mind we'll give you a green light. If not you can still publish your plugins yourself.  

Make sure to read the plugin documentation before you start developing one.

**New Core Features**

Before you start working on a new core feature it's better to open an issue first. Once you have a green light you can get started. If you start working on something larger, it's a good idea to create a draft (WIP) PR at an early stage so that we can guide you in the right direction.

**Security Issues**

If you see any security issue we prefer you to disclose it via an email (security@better-auth.com). All reports will be promptly addressed, and you'll be credited accordingly.

### A Few Guidelines to keep in mind

- Rather than extensive configurations, focus instead on providing opinionated, best-practice defaults.
- Try to make a consistent and predictable API across all supported frameworks
- Everything should be type-safe and embrace typescript magic when necessary. 

## Development

1. Fork the repo
2. clone your fork.
3. install node.js (preferable latest LTS).
4. run pnpm i in your terminal to install dependencies.
5. create a branch.
6. create a draft pull request. link the relevant issue by referring to it in the PR's description. Eg.closes #123 will link the PR to issue/pull request #123.
7. implement your changes.

## Testing

At the moment, we're only focusing on unit tests. Before we reach v1, we'll expand to include extensive integration testing. For now, please follow these guidelines:

- Add your tests in the same place as your functionality—no need to create separate folders.
- Avoid mocking unless absolutely necessary.
- Only use vitest for testing.
- If you need an auth instance, use getTestInstance instead of creating one manually, unless there's a specific reason to do so.
