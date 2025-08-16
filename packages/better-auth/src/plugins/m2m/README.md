# M2M (Machine-to-Machine) Plugin

The M2M plugin provides OAuth 2.0 Client Credentials Grant flow for machine-to-machine authentication. This allows servers and automated processes to authenticate with your API without user interaction.

## Features

- **OAuth 2.0 Client Credentials Grant**: Standard-compliant M2M authentication
- **Client Management**: Create, list, update, and delete M2M clients
- **Scope-based Authorization**: Control what each client can access
- **Client Expiration**: Set expiration dates for clients
- **Metadata Support**: Store additional information about clients
- **Rate Limiting**: Built-in rate limiting for token requests
- **Secure Secret Storage**: Client secrets are hashed by default

## Installation

The M2M plugin is included with Better-Auth. No additional installation is required.

## Basic Usage

### 1. Add the Plugin to Your Auth Configuration

```typescript
import { createAuth } from "better-auth";
import { m2m } from "better-auth/plugins/m2m";

const auth = createAuth({
  adapter: yourAdapter,
  plugins: [
    m2m({
      // Optional configuration
      enableMetadata: true,
      requireClientName: false,
    }),
  ],
});
```

### 2. Create an M2M Client

```typescript
// Create a new M2M client
const response = await auth.api.post("/m2m/clients", {
  name: "My API Server",
  scopes: ["read", "write"],
  metadata: { environment: "production" },
  expiresIn: 365, // Expires in 365 days
});

console.log(response.data);
// {
//   id: "client_123",
//   clientId: "abc123def456",
//   clientSecret: "xyz789...", // Only returned once!
//   name: "My API Server",
//   scopes: ["read", "write"],
//   metadata: { environment: "production" },
//   expiresAt: "2025-01-01T00:00:00.000Z",
//   createdAt: "2024-01-01T00:00:00.000Z"
// }
```

### 3. Get an Access Token

```typescript
// From your API server, request an access token
const tokenResponse = await fetch("https://your-auth-server.com/m2m/token", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: "abc123def456",
    client_secret: "xyz789...",
    scope: "read write",
  }),
});

const tokenData = await tokenResponse.json();
// {
//   access_token: "eyJhbGciOiJIUzI1NiIs...",
//   token_type: "bearer",
//   expires_in: 3600,
//   refresh_token: "def456ghi789...",
//   scope: "read write"
// }
```

### 4. Use the Access Token

```typescript
// Use the access token to make authenticated requests
const apiResponse = await fetch("https://your-api-server.com/protected-endpoint", {
  headers: {
    Authorization: `Bearer ${tokenData.access_token}`,
  },
});
```

## API Endpoints

### Token Endpoint

**POST** `/m2m/token`

Get an access token using client credentials.

**Request Body:**
```typescript
{
  grant_type: "client_credentials",
  client_id: string,
  client_secret: string,
  scope?: string // Optional, space-separated scopes
}
```

**Response:**
```typescript
{
  access_token: string,
  token_type: "bearer",
  expires_in: number,
  refresh_token: string,
  scope: string
}
```

### Client Management Endpoints

**POST** `/m2m/clients` - Create a new M2M client
**GET** `/m2m/clients` - List all M2M clients
**GET** `/m2m/clients/:id` - Get a specific M2M client
**PUT** `/m2m/clients/:id` - Update an M2M client
**DELETE** `/m2m/clients/:id` - Delete an M2M client

## Configuration Options

```typescript
m2m({
  // Client secret configuration
  defaultClientSecretLength: 64,
  disableClientSecretHashing: false,

  // Client name configuration
  requireClientName: false,
  maximumClientNameLength: 100,
  minimumClientNameLength: 1,

  // Metadata configuration
  enableMetadata: false,

  // Rate limiting
  rateLimit: {
    enabled: true,
    timeWindow: 24 * 60 * 60 * 1000, // 24 hours
    maxRequests: 1000,
  },

  // Client expiration
  clientExpiration: {
    defaultExpiresIn: null, // No default expiration
    disableCustomExpiresTime: false,
    maxExpiresIn: 365, // Maximum 365 days
    minExpiresIn: 1, // Minimum 1 day
  },

  // Token expiration
  accessTokenExpiresIn: 3600, // 1 hour
  refreshTokenExpiresIn: 2592000, // 30 days

  // Starting characters for display
  startingCharactersConfig: {
    shouldStore: true,
    charactersLength: 6,
  },
})
```

## Client Utilities

The plugin provides client utilities for easier management:

```typescript
import { m2mClient } from "better-auth/plugins/m2m/client";

const client = m2mClient(auth);

// Create a client
const newClient = await client.createClient({
  name: "My Server",
  scopes: ["read"],
});

// List clients
const clients = await client.listClients({ limit: 10, offset: 0 });

// Get a specific client
const clientDetails = await client.getClient("client_id");

// Update a client
await client.updateClient("client_id", {
  name: "Updated Name",
  disabled: false,
});

// Delete a client
await client.deleteClient("client_id");

// Get access token
const token = await client.getAccessToken({
  clientId: "abc123",
  clientSecret: "xyz789",
  scope: "read",
});
```

## Security Considerations

1. **Client Secret Storage**: Client secrets are hashed by default. Store the plain secret securely when first created.

2. **Scope Validation**: Always validate scopes to ensure clients only access what they're authorized for.

3. **Client Expiration**: Use client expiration to limit the lifetime of credentials.

4. **Rate Limiting**: Enable rate limiting to prevent abuse.

5. **HTTPS Only**: Always use HTTPS in production to protect credentials in transit.

## Error Handling

The plugin returns standard OAuth 2.0 error responses:

```typescript
// Invalid client
{
  error: "invalid_client",
  error_description: "Invalid client ID"
}

// Invalid scope
{
  error: "invalid_scope",
  error_description: "Invalid scope"
}

// Unsupported grant type
{
  error: "unsupported_grant_type",
  error_description: "grant_type must be 'client_credentials'"
}
```

## Use Cases

- **API-to-API Communication**: When one service needs to call another
- **Background Jobs**: Automated processes that need API access
- **Microservices**: Service-to-service authentication
- **Webhooks**: Secure webhook delivery
- **Cron Jobs**: Scheduled tasks that need API access

## Example: Complete Setup

```typescript
// auth-server.ts
import { createAuth } from "better-auth";
import { m2m } from "better-auth/plugins/m2m";
import { libsqlAdapter } from "better-auth/adapters/libsql";

const auth = createAuth({
  adapter: libsqlAdapter({
    url: "file:./auth.db",
  }),
  plugins: [
    m2m({
      enableMetadata: true,
      requireClientName: true,
      clientExpiration: {
        defaultExpiresIn: 365,
        maxExpiresIn: 730,
      },
    }),
  ],
});

// api-server.ts
import { verifyToken } from "better-auth";

// Middleware to verify M2M tokens
async function verifyM2MToken(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = await verifyToken(token, auth);
    req.m2mClient = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Protected endpoint
app.get("/api/data", verifyM2MToken, (req, res) => {
  // req.m2mClient contains the client information
  res.json({ data: "Protected data" });
});
```

This plugin provides a complete solution for machine-to-machine authentication using OAuth 2.0 Client Credentials Grant flow, making it easy to secure API-to-API communication in your applications. 