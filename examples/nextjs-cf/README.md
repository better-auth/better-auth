## Better Auth Next JS Cloudflare, D1 Example

Better auth example with next js, cf, d1. Implements

- Magic Link
- Social Sign-On
- Passkey
- Session & Account Management

## Guide

1. Install
```bash
pnpm install
```
1. Create D1 Database

```bash
npx wrangler d1 create my_database    
```

3. Add the binding to `wrangler.toml`

4. Run the migration
```bash
npx wrangler d1 migrations apply my_database --local
```

5. Fill environment variables (see .dev.vars.example)

6. Run