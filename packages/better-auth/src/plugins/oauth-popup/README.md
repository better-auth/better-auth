# OAuth Popup (experimental)

> **Experimental.** The API may change while this plugin is experimental.

Popup-based OAuth sign-in. The OAuth flow runs in a popup and the completion
page posts the session token back to the opener, so an app can sign in **inside
a cross-site iframe** where its auth cookie is partitioned. Pairs with the
`bearer` plugin.

For a normal top-level app, prefer the redirect flow (`signIn.social`). Reach
for the popup when a top-level redirect is not possible (embedded / iframe).

## Setup

Server (`bearer` is required):

```ts
import { betterAuth } from "better-auth";
import { bearer, oauthPopup } from "better-auth/plugins";

export const auth = betterAuth({
  trustedOrigins: ["https://your-app.com"], // the opener app origin(s)
  plugins: [oauthPopup(), bearer()],
});
```

Client:

```ts
import { createAuthClient } from "better-auth/client";
import { oauthPopupClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: "https://your-auth-origin.com",
  plugins: [oauthPopupClient()],
});
```

Sign in:

```ts
const { data, error } = await authClient.signIn.popup({
  provider: "github", // or `providerId` for a genericOAuth provider
  callbackURL: "/dashboard",
});
```

## Requirements

- **`bearer` plugin** on the server. An embedded app authenticates with the
  handed-back token via `Authorization: Bearer`, since its cookie is
  partitioned.
- **`trustedOrigins`** must include the app (opener) origin. The popup only
  posts the token to a trusted origin.
- **COOP headers (top-level only).** The page that opens the popup must allow it
  (`Cross-Origin-Opener-Policy: same-origin-allow-popups` if it sets COOP at
  all), and your auth API must not send a swap-triggering COOP on the callback
  (for example, disable it in a security-headers middleware). COOP does not
  apply inside an iframe.

## Security

The session token is posted to the opener via `postMessage` (pinned to a
trusted origin) and stored in `localStorage` only when embedded. Treat it like
any bearer token: an XSS on the app origin can read it. Keep session lifetimes
short and the app free of XSS.
