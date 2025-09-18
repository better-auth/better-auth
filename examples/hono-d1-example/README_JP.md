## セットアップ

### 依存関係のインストール
```shell
pnpm install
```

### プレースホルダーの置き換え
使用する前に、`example` とマークされている値を正しいものに置き換えてください。

## Honoでの利用

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

## Reactでの利用

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

## コマンド

### better-auth:generate

better-auth の DDL をダンプします。

```shell
pnpm run better-auth:generate
```

### wrangler:migrate:local:list
ローカルデータベースのマイグレーション一覧を表示します。

```shell
pnpm run wrangler:migrate:local:list
```

### wrangler:migrate:local:apply
ローカルデータベースにマイグレーションを適用します。

```shell
pnpm run wrangler:migrate:local:apply
```

### wrangler:migrate:production:list
リモートデータベースのマイグレーション一覧を表示します。

```shell
pnpm run wrangler:migrate:production:list
```

### wrangler:migrate:production:apply
リモートデータベースにマイグレーションを適用します。

```shell
pnpm run wrangler:migrate:production:apply
```
