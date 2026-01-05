---
title: Slack
description: Slack provider setup and usage.
---

<Steps>
    <Step> 
        ### Get your Slack credentials
        To use Slack as a social provider, you need to create a Slack app and get your credentials.

        1. Go to [Your Apps on Slack API](https://api.slack.com/apps) and click "Create New App"
        2. Choose "From scratch" and give your app a name and select a development workspace
        3. In your app settings, navigate to "OAuth & Permissions"
        4. Under "Redirect URLs", add your redirect URL:
           - For local development: `http://localhost:3000/api/auth/callback/slack`
           - For production: `https://yourdomain.com/api/auth/callback/slack`
        5. Copy your Client ID and Client Secret from the "Basic Information" page

        <Callout>
            Slack requires HTTPS for redirect URLs in production. For local development, you can use tools like [ngrok](https://ngrok.com/) to create a secure tunnel.
        </Callout>
    </Step>

    <Step>
        ### Configure the provider
        To configure the provider, you need to pass the `clientId` and `clientSecret` to `socialProviders.slack` in your auth configuration.

        ```ts title="auth.ts"
        import { betterAuth } from "better-auth"

        export const auth = betterAuth({
            socialProviders: {
                slack: { // [!code highlight]
                    clientId: process.env.SLACK_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.SLACK_CLIENT_SECRET as string, // [!code highlight]
                }, // [!code highlight]
            },
        })
        ```
    </Step>

</Steps>

## Usage

### Sign In with Slack

To sign in with Slack, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:

- `provider`: The provider to use. It should be set to `slack`.

```ts title="auth-client.ts"
import { createAuthClient } from "better-auth/client";
const authClient = createAuthClient();

const signIn = async () => {
  const data = await authClient.signIn.social({ provider: "slack" });
};
```

### Requesting Additional Scopes

By default, Slack uses OpenID Connect scopes: `openid`, `profile`, and `email`. You can request additional Slack scopes during sign-in:

```ts title="auth-client.ts"
const signInWithSlack = async () => {
  await authClient.signIn.social({
    provider: "slack",
    scopes: ["channels:read", "chat:write"], // Additional Slack API scopes
  });
};
```

### Workspace-Specific Sign In

If you want to restrict sign-in to a specific Slack workspace, you can pass the `team` parameter:

```ts title="auth.ts"
socialProviders: {
    slack: {
        clientId: process.env.SLACK_CLIENT_ID as string,
        clientSecret: process.env.SLACK_CLIENT_SECRET as string,
        team: "T1234567890", // Your Slack workspace ID
    },
}
```

### Using Slack API After Sign In

After successful authentication, you can access the user's Slack information through the session. The access token can be used to make requests to the Slack API:

```ts
const session = await authClient.getSession();
if (session?.user) {
  // Access Slack-specific data
  const slackUserId = session.user.id; // This is the Slack user ID
  // The access token is stored securely on the server
}
```

<Callout>
  The Slack provider uses OpenID Connect by default, which provides basic user
  information. If you need to access other Slack APIs, make sure to request the
  appropriate scopes during sign-in.
</Callout>
