---
title: Dub
description: Better Auth Plugin for Lead Tracking using Dub links and OAuth Linking
---

[Dub](https://dub.co/) is an open source modern link management platform for entrepreneurs, creators, and growth teams.

This plugins allows you to track leads when a user signs up using a Dub link. It also adds OAuth linking support to allow you to build integrations extending Dub's linking management infrastructure.

## Installation

<Steps>
    <Step>
        ### Install the plugin
        First, install the plugin:

        ```package-install
        @dub/better-auth
        ```
    </Step>
    <Step>
        ### Install the Dub SDK

        Next, install the Dub SDK on your server:

        ```package-install
        dub
        ```
    </Step>
    <Step>
        ### Configure the plugin

        Add the plugin to your auth config:

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"
        import { dubAnalytics } from "@dub/better-auth"
        import { dub } from "dub"

        export const auth = betterAuth({
            plugins: [
                dubAnalytics({
                    dubClient: new Dub()
                })
            ]
        })
        ```
    </Step>

</Steps>

## Usage

### Lead Tracking

By default, the plugin will track sign up events as leads. You can disable this by setting `disableLeadTracking` to `true`.

```ts
import { dubAnalytics } from "@dub/better-auth";
import { betterAuth } from "better-auth";
import { Dub } from "dub";

const dub = new Dub();

const betterAuth = betterAuth({
  plugins: [
    dubAnalytics({
      dubClient: dub,
      disableLeadTracking: true, // Disable lead tracking
    }),
  ],
});
```

### OAuth Linking

The plugin supports OAuth for account linking.

First, you need to setup OAuth app in Dub. Dub supports OAuth 2.0 authentication, which is recommended if you build integrations extending Dub’s functionality [Learn more about OAuth](https://dub.co/docs/integrations/quickstart#integrating-via-oauth-2-0-recommended).

Once you get the client ID and client secret, you can configure the plugin.

```ts
dubAnalytics({
  dubClient: dub,
  oauth: {
    clientId: "your-client-id",
    clientSecret: "your-client-secret",
  },
});
```

And in the client, you need to use the `dubAnalyticsClient` plugin.

```ts
import { createAuthClient } from "better-auth/client";
import { dubAnalyticsClient } from "@dub/better-auth/client";

const authClient = createAuthClient({
  plugins: [dubAnalyticsClient()],
});
```

To link account with Dub, you need to use the `dub.link`.

<APIMethod path="/dub/link" method="POST" requireSession>
```ts
type dubLink = {
  /**
   * URL to redirect to after linking
   * @clientOnly
  */
  callbackURL: string = "/dashboard"
}
```
</APIMethod>

## Options

You can pass the following options to the plugin:

### `dubClient`

The Dub client instance.

### `disableLeadTracking`

Disable lead tracking for sign up events.

### `leadEventName`

Event name for sign up leads.

### `customLeadTrack`

Custom lead track function.

### `oauth`

Dub OAuth configuration.

### `oauth.clientId`

Client ID for Dub OAuth.

### `oauth.clientSecret`

Client secret for Dub OAuth.

### `oauth.pkce`

Enable PKCE for Dub OAuth.
