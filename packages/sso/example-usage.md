# SSO Plugin Configuration Examples

## Configuration-based Providers (No Database Storage)

Configuration-based providers are defined directly in your code and exist only at runtime. They don't require a `userId` since they're not tied to any specific user.

```ts
import { betterAuth } from "better-auth"
import { sso } from "@better-auth/sso"

const auth = betterAuth({
    database: { /* your db config */ },
    plugins: [
        sso({
            providers: [
                {
                    providerId: "google-workspace",
                    issuer: "https://accounts.google.com", 
                    domain: "yourcompany.com",
                    oidcConfig: {
                        clientId: process.env.GOOGLE_CLIENT_ID!,
                        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
                        discoveryEndpoint: "https://accounts.google.com/.well-known/openid-configuration",
                        pkce: true
                    }
                },
                {
                    providerId: "company-saml",
                    issuer: "https://idp.yourcompany.com",
                    domain: "yourcompany.com",
                    organizationId: "org_123", // Optional: link to organization
                    samlConfig: {
                        entryPoint: "https://idp.yourcompany.com/sso",
                        cert: process.env.SAML_CERT!
                    }
                }
            ]
        })
    ]
})
```

## Runtime Provider Registration (Database Storage) 

Runtime providers are registered via API endpoints and stored in the database with a `userId`.

```ts
// Register a provider at runtime (requires authenticated user)
await authClient.sso.register({
    providerId: "custom-provider",
    issuer: "https://custom.idp.com",
    domain: "custom.com",
    oidcConfig: {
        clientId: "client-123",
        clientSecret: "secret-456",
        discoveryEndpoint: "https://custom.idp.com/.well-known/openid-configuration",
        pkce: true
    }
})
```

## Key Differences

| Aspect | Configuration-based | Runtime Registration |
|--------|-------------------|---------------------|
| Storage | Runtime only | Database persisted |
| `userId` | `undefined` (no owner) | Required (user who registered) |
| Updates | Change config & restart | API calls or DB updates |
| Use case | Static/env-based providers | Dynamic/user-managed providers |
| Migration | Config changes only | May need DB migrations |