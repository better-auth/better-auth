# Better Auth Telemetry

Better Auth includes an optional telemetry system that helps us understand how the package is being used. This information is valuable for improving the package and focusing our development efforts.

## What We Collect

The telemetry system collects:

- **Anonymous Installation ID**: A randomly generated ID that helps us understand unique installations
- **Runtime Information**: Node.js version, runtime (Node/Deno/Bun), framework being used
- **Usage Data**: Which features and plugins are being used
- **Error Data**: Types of errors encountered (no personal information or stack traces)
- **Performance Data**: API request patterns and timing

We do NOT collect:

- Personal information
- Usernames or emails
- Passwords or secrets
- Application code
- Database contents
- IP addresses
- Domain names

## Events

The following events are tracked:

- `init`: When Better Auth is initialized
- `api_request`: When an API endpoint is called
- `error`: When an error occurs
- `auth_success`: When authentication succeeds
- `auth_failure`: When authentication fails

## Opting Out

You can opt out of telemetry in several ways:

1. Environment variable:
```bash
BETTER_AUTH_TELEMETRY=0
```

2. Configuration option:
```typescript
const auth = betterAuth({
  telemetry: {
    enabled: false
  }
});
```

## Custom Endpoint

You can send telemetry to your own endpoint:

```typescript
const auth = betterAuth({
  telemetry: {
    endpoint: "https://your-telemetry-endpoint.com/events"
  }
});
```

## Additional Data

You can include additional data with every telemetry event:

```typescript
const auth = betterAuth({
  telemetry: {
    additionalData: {
      region: "us-east-1",
      environment: "staging"
    }
  }
});
```

## Privacy & Security

- All data is collected anonymously
- No personally identifiable information (PII) is collected
- Data is transmitted securely via HTTPS
- Data is used only for improving Better Auth
- Raw data is not shared with third parties 