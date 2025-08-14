# Better Auth + Hono + D1 Example

### 日本語版は[こちら](https://github.com/shinaps/better-auth-hono-d1/blob/main/README_JP.md)を参照してください。

## Set Up

### Install Dependencies
```shell
pnpm install
```

### Replace Placeholders
Before using, replace any values marked with `example` with the correct ones.

## Usage with Hono

```typescript
app.use(async (c, next) => {
  const authClient = createAuthClient({
    baseURL: 'https://auth.example.com',
  })

  const result = await authClient.getSession({
    fetchOptions: {
      headers: c.req.raw.headers,
    },
  })

  if (!result.data) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
})
```

## Usage with React

```tsx
// src/lib/auth.ts
import { createAuthClient } from 'better-auth/react'
import { env } from '@/lib/env.ts'

export const authClient = createAuthClient({
  baseURL: 'https://auth.example.com',
})
```

```tsx
// src/layouts/auth-layout.tsx
import { Navigate, Outlet } from 'react-router-dom'
import { authClient } from '@/lib/auth.ts'

export const AuthLayout = () => {
  const { data: session, isPending, error } = authClient.useSession()

  if (isPending) {
    return <div>Loading...</div>
  }

  if (error || !session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
```

## Commands

### better-auth:generate

Dump the DDL for better-auth. 

```shell
pnpm run better-auth:generate
```

### wrangler:migrate:local:list
Display a list of migrations for the local database.

```shell
pnpm run wrangler:migrate:local:list
```

### wrangler:migrate:local:apply
Apply migrations to the local database.

```shell
pnpm run wrangler:migrate:local:apply
```

### wrangler:migrate:remote:list
Display a list of migrations for the remote database.

```shell
pnpm run wrangler:migrate:remote:list
```

### wrangler:migrate:remote:apply
Apply migrations to the remote database.

```shell
pnpm run wrangler:migrate:remote:apply
```
