---
title: Hono Integration
description: Integrate Better Auth with Hono.
---

Before you start, make sure you have a Better Auth instance configured. If you haven't done that yet, check out the [installation](/docs/installation).

### Mount the handler

We need to mount the handler to Hono endpoint.

```ts
import { Hono } from "hono";
import { auth } from "./auth";
import { serve } from "@hono/node-server";

const app = new Hono();

app.on(["POST", "GET"], "/api/auth/*", (c) => {
	return auth.handler(c.req.raw);
});

serve(app);
```

### Cors

To configure cors, you need to use the `cors` plugin from `hono/cors`.

```ts
import { Hono } from "hono";
import { auth } from "./auth";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
 
const app = new Hono();

app.use(
	"/api/auth/*", // or replace with "*" to enable cors for all routes
	cors({
		origin: "http://localhost:3001", // replace with your origin
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["POST", "GET", "OPTIONS"],
		exposeHeaders: ["Content-Length"],
		maxAge: 600,
		credentials: true,
	}),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => {
	return auth.handler(c.req.raw);
});

serve(app);
```

> **Important:** CORS middleware must be registered before your routes. This ensures that cross-origin requests are properly handled before they reach your authentication endpoints.

### Middleware

You can add a middleware to save the `session` and `user` in a `context` and also add validations for every route.

```ts
import { Hono } from "hono";
import { auth } from "./auth";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
 
const app = new Hono<{
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null
	}
}>();

app.use("*", async (c, next) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });

  	if (!session) {
    	c.set("user", null);
    	c.set("session", null);
    	await next();
        return;
  	}

  	c.set("user", session.user);
  	c.set("session", session.session);
  	await next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => {
	return auth.handler(c.req.raw);
});


serve(app);
```

This will allow you to access the `user` and `session` object in all of your routes.

```ts
app.get("/session", (c) => {
	const session = c.get("session")
	const user = c.get("user")
	
	if(!user) return c.body(null, 401);

  	return c.json({
	  session,
	  user
	});
});
```

### Cross-Domain Cookies

By default, all Better Auth cookies are set with `SameSite=Lax`. If you need to use cookies across different domains, you’ll need to set `SameSite=None` and `Secure=true`. However, we recommend using subdomains whenever possible, as this allows you to keep `SameSite=Lax`. To enable cross-subdomain cookies, simply turn on `crossSubDomainCookies` in your auth config.

```ts title="auth.ts"
export const auth = createAuth({
  advanced: {
    crossSubDomainCookies: {
      enabled: true
    }
  }
})
```

If you still need to set `SameSite=None` and `Secure=true`, you can adjust these attributes globally through `cookieOptions` in the `createAuth` configuration.

```ts title="auth.ts"
export const auth = createAuth({
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      partitioned: true // New browser standards will mandate this for foreign cookies
    }
  }
})
```

You can also customize cookie attributes individually by setting them within `cookies` in your auth config.

```ts title="auth.ts"
export const auth = createAuth({
  advanced: {
    cookies: {
      sessionToken: {
        attributes: {
          sameSite: "none",
          secure: true,
          partitioned: true // New browser standards will mandate this for foreign cookies
        }
      }
    }
  }
})
```

### Client-Side Configuration

When using the Hono client (`@hono/client`) to make requests to your Better Auth-protected endpoints, you need to configure it to send credentials (cookies) with cross-origin requests.

```ts title="api.ts"
import { hc } from "hono/client";
import type { AppType } from "./server"; // Your Hono app type

const client = hc<AppType>("http://localhost:8787/", {
  init: {
    credentials: "include", // Required for sending cookies cross-origin
  },
});

// Now your client requests will include credentials
const response = await client.someProtectedEndpoint.$get();
```

This configuration is necessary when:
- Your client and server are on different domains/ports during development
- You're making cross-origin requests in production
- You need to send authentication cookies with your requests

The `credentials: "include"` option tells the fetch client to send cookies even for cross-origin requests. This works in conjunction with the CORS configuration on your server that has `credentials: true`.

> **Note:** Make sure your CORS configuration on the server matches your client's domain, and that `credentials: true` is set in both the server's CORS config and the client's fetch config.
