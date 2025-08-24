---
title: Multi Session
description: Learn how to use multi-session plugin in Better Auth.
---

The multi-session plugin allows users to maintain multiple active sessions across different accounts in the same browser. This plugin is useful for applications that require users to switch between multiple accounts without logging out.

## Installation

<Steps>
<Step>
### Add the plugin to your **auth** config
```ts title="auth.ts"
import { betterAuth } from "better-auth"
import { multiSession } from "better-auth/plugins"

export const auth = betterAuth({
    plugins: [ // [!code highlight]
        multiSession(), // [!code highlight]
    ] // [!code highlight]
})
```
</Step>
<Step>
        ### Add the client Plugin

        Add the client plugin and Specify where the user should be redirected if they need to verify 2nd factor

        ```ts title="auth-client.ts"
        import { createAuthClient } from "better-auth/client"
        import { multiSessionClient } from "better-auth/client/plugins"

        export const authClient = createAuthClient({
            plugins: [
                multiSessionClient()
            ]
        })
        ```
        </Step>
</Steps>    


## Usage

Whenever a user logs in, the plugin will add additional cookie to the browser. This cookie will be used to maintain multiple sessions across different accounts. 


### List all device sessions

To list all active sessions for the current user, you can call the `listDeviceSessions` method.

<APIMethod
  path="/multi-session/list-device-sessions"
  method="GET"
  requireSession
>
```ts
type listDeviceSessions = {
}
```
</APIMethod>

### Set active session

To set the active session, you can call the `setActive` method.

<APIMethod
  path="/multi-session/set-active"
  method="POST"
  requireSession
>
```ts
type setActiveSession = {
    /**
     * The session token to set as active. 
     */
    sessionToken: string = "some-session-token"
}
```
</APIMethod>

### Revoke a session

To revoke a session, you can call the `revoke` method.

<APIMethod
  path="/multi-session/revoke"
  method="POST"
  requireSession
>
```ts
type revokeDeviceSession = {
    /**
     * The session token to revoke. 
     */
    sessionToken: string = "some-session-token"
}
```
</APIMethod>

### Signout and Revoke all sessions

When a user logs out, the plugin will revoke all active sessions for the user. You can do this by calling the existing `signOut` method, which handles revoking all sessions automatically.

### Max Sessions

You can specify the maximum number of sessions a user can have by passing the `maximumSessions` option to the plugin. By default, the plugin allows 5 sessions per device.

```ts title="auth.ts"
import { betterAuth } from "better-auth"

export const auth = betterAuth({
    plugins: [
        multiSession({
            maximumSessions: 3
        })
    ]
})
```