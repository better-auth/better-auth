# Better Auth - Stateless Session Demo

This demo showcases **stateless session management** using Better Auth with JWT-based sessions.

## Features

- ✅ **No Database Required** - Sessions stored in encrypted JWT cookies
- ✅ **OAuth Authentication** - GitHub OAuth integration
- ✅ **Scalable Architecture** - Works across multiple servers without shared storage
- ✅ **Fast Performance** - Zero database queries for session validation
- ✅ **Cookie Caching** - Optional caching layer for even faster access

## How It Works

This demo uses `storeSessionInCookie: true` to enable stateless sessions:

1. **Sign In**: User authenticates via GitHub OAuth
2. **Session Creation**: Session and user data are encrypted into a JWT
3. **Storage**: JWT is stored in a secure HTTP-only cookie
4. **Validation**: On each request, the JWT is decrypted - no database access needed
5. **Expiration**: Sessions expire automatically based on JWT expiration time

## Configuration

```typescript
// lib/auth.ts
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  },

  session: {
    storeSessionInCookie: true, // Enable stateless sessions
  },

  advanced: {
    oauthConfig: {
      storeStateStrategy: "cookie", // Required for stateless mode
    },
  },
});
```

## Running the Demo

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env.local
   ```

   Add your GitHub OAuth credentials:
   ```
   BETTER_AUTH_SECRET=your-secret-key
   BETTER_AUTH_URL=http://localhost:3000
   GITHUB_CLIENT_ID=your-github-client-id
   GITHUB_CLIENT_SECRET=your-github-client-secret
   ```

3. **Start the development server**:
   ```bash
   pnpm dev
   ```

4. **Open the app**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## Key Files

- `src/lib/auth.ts` - Server-side auth configuration
- `src/lib/auth-client.ts` - Client-side auth setup
- `src/app/page.tsx` - Landing page with GitHub sign-in
- `src/app/dashboard/page.tsx` - Protected dashboard displaying session data
- `src/app/api/user/route.ts` - API endpoint demonstrating server-side session access

## What's Different from Database Sessions?

### Enabled Features:
- ✅ Session retrieval (`getSession`, `useSession`)
- ✅ Sign in/out
- ✅ Server-side session access
- ✅ OAuth authentication

### Not Available:
- ❌ Session revocation (`revokeSession`, `revokeOtherSessions`)
- ❌ Session listing (`listSessions`)
- ❌ Email/password authentication
- ❌ Password management

## Documentation

For complete documentation on stateless sessions, see:
- [Stateless Sessions Guide](https://better-auth.com/docs/guides/stateless-sessions)

## Learn More

- [Better Auth Documentation](https://better-auth.com/docs)
- [GitHub Repository](https://github.com/better-auth/better-auth)
