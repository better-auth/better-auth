---
title: Notion
description: Notion provider setup and usage.
---

<Steps>
    <Step> 
        ### Get your Notion credentials
        To use Notion as a social provider, you need to get your Notion OAuth credentials. You can get them by creating a new integration in the [Notion Developers Portal](https://www.notion.so/my-integrations).

        In the Notion integration settings > OAuth Domain & URIs, make sure to set the redirect URL to `http://localhost:3000/api/auth/callback/notion` for local development. For production, make sure to set the redirect URL as your application domain, e.g. `https://example.com/api/auth/callback/notion`. If you change the base path of the auth routes, you should update the redirect URL accordingly.

        <Callout>
        Make sure your Notion integration has the appropriate capabilities enabled. For user authentication, you'll need the "Read user information including email addresses" capability.
        </Callout>
    </Step>

  <Step>
        ### Configure the provider
        To configure the provider, you need to pass the `clientId` and `clientSecret` to `socialProviders.notion` in your auth configuration.

        ```ts title="auth.ts"   
        import { betterAuth } from "better-auth"
        
        export const auth = betterAuth({
            socialProviders: {
                notion: { // [!code highlight]
                    clientId: process.env.NOTION_CLIENT_ID as string, // [!code highlight]
                    clientSecret: process.env.NOTION_CLIENT_SECRET as string, // [!code highlight]
                }, // [!code highlight]
            },
        })
        ```
    </Step>
</Steps>

## Usage

### Sign In with Notion

To sign in with Notion, you can use the `signIn.social` function provided by the client. The `signIn` function takes an object with the following properties:
- `provider`: The provider to use. It should be set to `notion`.

```ts title="auth-client.ts"  
import { createAuthClient } from "better-auth/client"
const authClient =  createAuthClient()

const signIn = async () => {
    const data = await authClient.signIn.social({
        provider: "notion"
    })
}
```

### Notion Integration Types

Notion supports different integration types. When creating your integration, you can choose between:

- **Public integrations**: Can be installed by any Notion workspace
- **Internal integrations**: Limited to your own workspace

For most authentication use cases, you'll want to create a public integration to allow users from different workspaces to sign in.

### Requesting Additional Notion Scopes

If your application needs additional Notion capabilities after the user has already signed up, you can request them using the `linkSocial` method with the same Notion provider and additional scopes.

```ts title="auth-client.ts"
const requestNotionAccess = async () => {
    await authClient.linkSocial({
        provider: "notion",
        // Notion automatically provides access based on integration capabilities
    });
};

// Example usage in a React component
return <button onClick={requestNotionAccess}>Connect Notion Workspace</button>;
```

<Callout>
After authentication, you can use the access token to interact with the Notion API to read and write pages, databases, and other content that the user has granted access to.
</Callout>