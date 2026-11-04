# Better Auth Electron Example

This is an example of how to use Better Auth with Electron.

## Prerequirements

Make sure you've set-up the [Better Auth Demo App](../nextjs/README.md).

## How to run

1. Clone the repo and open it in your code editor
2. Run the following commands

  ```bash
  pnpm install
  pnpm dev
  ```

Checkout the [electron guide](https://www.better-auth.com/docs/integrations/electron) to learn more.

## Browser verification and recovery

The browser demo completes two-factor verification before handing sign-in to Electron. Keep the browser open while verifying. If the pending desktop request expires, start a new sign-in from the Electron app even if browser verification succeeded.

For manual entry, copy the complete browser code and submit it in Electron. The packed code carries state as well as the identifier. It is not limited to 32 characters. The Electron app must have started the matching browser request. A rejected or expired code needs a new browser sign-in.
