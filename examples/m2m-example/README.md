# M2M Authentication Example

This example demonstrates how to use the Better-Auth M2M (Machine-to-Machine) plugin for OAuth 2.0 Client Credentials Grant flow.

## Features Demonstrated

- Creating M2M clients with scopes and metadata
- Managing client lifecycle (create, list, update, delete)
- Token generation using client credentials
- Scope-based authorization
- Client expiration management
- Secure client secret handling

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Database

The example uses LibSQL (SQLite) as the database. The database file will be created automatically when you first run the application.

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the example.

## How to Use

### 1. Create an M2M Client

1. Fill out the form on the page with:
   - **Client Name**: A descriptive name for your client
   - **Scopes**: Space-separated list of permissions (e.g., "read write admin")
   - **Metadata**: Optional JSON metadata (e.g., `{"environment": "production"}`)
   - **Expiration**: Number of days until the client expires

2. Click "Create Client"
3. Copy the generated Client ID and Client Secret (only shown once!)

### 2. Get an Access Token

Use the client credentials to request an access token:

```bash
curl -X POST http://localhost:3000/api/m2m/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "your-client-id",
    "client_secret": "your-client-secret",
    "scope": "read write"
  }'
```

Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "def456ghi789...",
  "scope": "read write"
}
```

### 3. Use the Access Token

Include the access token in your API requests:

```bash
curl -H "Authorization: Bearer your-access-token" \
  https://your-api.com/protected-endpoint
```

## API Endpoints

### Create Client
```http
POST /api/m2m/clients
Content-Type: application/json

{
  "name": "My API Server",
  "scopes": ["read", "write"],
  "metadata": {"environment": "production"},
  "expiresIn": 365
}
```

### List Clients
```http
GET /api/m2m/clients?limit=10&offset=0
```

### Get Token
```http
POST /api/m2m/token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "your-client-id",
  "client_secret": "your-client-secret",
  "scope": "read write"
}
```

## Security Features

- **Client Secret Hashing**: Secrets are hashed before storage
- **Scope Validation**: Only requested scopes that are allowed for the client
- **Client Expiration**: Automatic expiration of clients
- **Rate Limiting**: Built-in rate limiting for token requests
- **Secure Token Generation**: Cryptographically secure tokens

## Configuration

The M2M plugin is configured with:

```typescript
m2m({
  enableMetadata: true,
  requireClientName: true,
  clientExpiration: {
    defaultExpiresIn: 365, // 1 year
    maxExpiresIn: 730,     // 2 years
    minExpiresIn: 1,       // 1 day
  },
  rateLimit: {
    enabled: true,
    timeWindow: 24 * 60 * 60 * 1000, // 24 hours
    maxRequests: 1000, // 1000 requests per day
  },
  accessTokenExpiresIn: 3600, // 1 hour
  refreshTokenExpiresIn: 2592000, // 30 days
})
```

## Use Cases

This M2M authentication is perfect for:

- **API-to-API Communication**: When one service needs to call another
- **Background Jobs**: Automated processes that need API access
- **Microservices**: Service-to-service authentication
- **Webhooks**: Secure webhook delivery
- **Cron Jobs**: Scheduled tasks that need API access

## Next Steps

1. **Production Setup**: Use a proper database like PostgreSQL or MySQL
2. **HTTPS**: Always use HTTPS in production
3. **Environment Variables**: Store sensitive configuration in environment variables
4. **Monitoring**: Add logging and monitoring for token usage
5. **Token Validation**: Implement token validation middleware for your API endpoints

## Troubleshooting

### Common Issues

1. **"Client not found"**: Make sure the client ID is correct
2. **"Invalid client secret"**: Check that the secret matches exactly
3. **"Invalid scope"**: Ensure the requested scopes are allowed for the client
4. **"Client is disabled"**: The client has been disabled and cannot be used
5. **"Client has expired"**: The client has passed its expiration date

### Debug Mode

To see more detailed error messages, you can modify the error handling in the API routes to include more information.

## Learn More

- [Better-Auth Documentation](https://better-auth.com)
- [OAuth 2.0 Client Credentials Grant](https://tools.ietf.org/html/rfc6749#section-4.4)
- [Machine-to-Machine Authentication Best Practices](https://auth0.com/blog/machine-to-machine-oauth/) 