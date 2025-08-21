# Machine-to-Machine (M2M) Authorization Implementation

## What the Issue Means

The original issue #676 requested adding a plugin for **Machine-to-Machine (M2M) Authorization** to Better-Auth. Here's what this means:

### The Problem
- **Current State**: Better-Auth only supports user-based authentication (email/password, OAuth, etc.)
- **Missing**: Server-to-server authentication without human interaction
- **Use Case**: APIs that need to authenticate with other APIs or automated processes

### Why M2M is Needed
1. **No Human Interaction**: Automated processes can't use email/password flows
2. **Email Verification Issues**: M2M clients can't complete email verification
3. **MFA Problems**: Machine processes can't handle multi-factor authentication
4. **OAuth 2.0 Standard**: Client Credentials Grant is a standard OAuth 2.0 flow

### The Solution: OAuth 2.0 Client Credentials Grant

The M2M plugin implements the **OAuth 2.0 Client Credentials Grant** flow:

```
Client (Machine) → Auth Server
     ↓
1. Send client_id + client_secret
     ↓
2. Auth Server validates credentials
     ↓
3. Auth Server returns access_token
     ↓
4. Client uses access_token for API calls
```

## Implementation Details

### 1. Core Plugin Structure

```
packages/better-auth/src/plugins/m2m/
├── index.ts          # Main plugin implementation
├── types.ts          # TypeScript types and interfaces
├── schema.ts         # Database schema definition
├── routes.ts         # API routes for client management
├── client.ts         # Client-side utilities
├── m2m.test.ts      # Comprehensive tests
└── README.md         # Documentation
```

### 2. Key Features Implemented

#### A. Client Management
- **Create Clients**: Generate client ID and secret pairs
- **List Clients**: View all M2M clients
- **Update Clients**: Modify client properties
- **Delete Clients**: Remove clients from the system

#### B. Token Generation
- **OAuth 2.0 Compliant**: Standard client_credentials grant type
- **Scope Validation**: Only allow requested scopes that are permitted
- **Secure Storage**: Client secrets are hashed by default
- **Token Expiration**: Configurable access and refresh token lifetimes

#### C. Security Features
- **Client Expiration**: Automatic expiration of clients
- **Rate Limiting**: Built-in rate limiting for token requests
- **Scope-based Authorization**: Fine-grained permission control
- **Client Disabling**: Ability to disable clients without deletion

### 3. API Endpoints

#### Token Endpoint
```http
POST /m2m/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&
client_id=your-client-id&
client_secret=your-client-secret&
scope=read write
```

#### Client Management Endpoints
```http
POST   /m2m/clients     # Create client
GET    /m2m/clients     # List clients
GET    /m2m/clients/:id # Get specific client
PUT    /m2m/clients/:id # Update client
DELETE /m2m/clients/:id # Delete client
```

### 4. Configuration Options

```typescript
m2m({
  // Security
  defaultClientSecretLength: 64,
  disableClientSecretHashing: false,
  
  // Client Management
  requireClientName: false,
  enableMetadata: false,
  
  // Expiration
  clientExpiration: {
    defaultExpiresIn: null,
    maxExpiresIn: 365,
    minExpiresIn: 1,
  },
  
  // Rate Limiting
  rateLimit: {
    enabled: true,
    timeWindow: 24 * 60 * 60 * 1000,
    maxRequests: 1000,
  },
  
  // Token Expiration
  accessTokenExpiresIn: 3600,
  refreshTokenExpiresIn: 2592000,
})
```

## Usage Examples

### 1. Basic Setup

```typescript
import { createAuth } from "better-auth";
import { m2m } from "better-auth/plugins/m2m";

const auth = createAuth({
  adapter: yourAdapter,
  plugins: [m2m()],
});
```

### 2. Create an M2M Client

```typescript
const response = await auth.api.post("/m2m/clients", {
  name: "My API Server",
  scopes: ["read", "write"],
  metadata: { environment: "production" },
  expiresIn: 365,
});

// Response includes clientId and clientSecret
console.log(response.data.clientId);
console.log(response.data.clientSecret);
```

### 3. Get Access Token

```typescript
const tokenResponse = await fetch("/m2m/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: "your-client-id",
    client_secret: "your-client-secret",
    scope: "read write",
  }),
});

const { access_token } = await tokenResponse.json();
```

### 4. Use Access Token

```typescript
const apiResponse = await fetch("/api/protected-endpoint", {
  headers: {
    Authorization: `Bearer ${access_token}`,
  },
});
```

## Security Considerations

### 1. Client Secret Storage
- Secrets are hashed using SHA-256 before storage
- Plain secrets are only returned once during creation
- Option to disable hashing for legacy systems

### 2. Scope Validation
- Clients can only request scopes they're authorized for
- Invalid scope requests are rejected with proper OAuth 2.0 errors

### 3. Client Lifecycle
- Clients can be disabled without deletion
- Automatic expiration prevents long-term credential exposure
- Audit trail through creation and update timestamps

### 4. Rate Limiting
- Configurable rate limiting prevents abuse
- Separate limits for token requests vs. client management

## Testing

The implementation includes comprehensive tests covering:

- ✅ Client creation and management
- ✅ Token generation with valid credentials
- ✅ Error handling for invalid credentials
- ✅ Scope validation
- ✅ Client expiration and disabling
- ✅ Rate limiting
- ✅ Input validation

## Example Application

A complete example application is provided at `examples/m2m-example/` that demonstrates:

- Web interface for client management
- API endpoints for token generation
- Usage instructions and documentation
- Real-world implementation patterns

## Benefits of This Implementation

### 1. Standards Compliance
- Follows OAuth 2.0 RFC 6749 specification
- Compatible with existing OAuth 2.0 tooling
- Standard error responses and status codes

### 2. Security
- Secure secret handling with hashing
- Scope-based authorization
- Configurable expiration and rate limiting
- Audit trail for all operations

### 3. Flexibility
- Configurable options for different use cases
- Metadata support for additional information
- Client utilities for easier management

### 4. Integration
- Seamless integration with existing Better-Auth plugins
- Uses existing database adapters
- Compatible with all Better-Auth features

## Use Cases

This M2M implementation solves real-world problems:

1. **API-to-API Communication**: Microservices authenticating with each other
2. **Background Jobs**: Automated processes accessing APIs
3. **Webhooks**: Secure webhook delivery between services
4. **Cron Jobs**: Scheduled tasks requiring API access
5. **Service Mesh**: Service-to-service authentication in distributed systems

## Conclusion

The M2M plugin provides a complete, secure, and standards-compliant solution for machine-to-machine authentication using OAuth 2.0 Client Credentials Grant flow. It addresses the original issue requirements while maintaining Better-Auth's high standards for security, flexibility, and ease of use.

The implementation is production-ready and includes comprehensive documentation, testing, and examples to help developers integrate M2M authentication into their applications. 