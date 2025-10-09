# Login Aliases - Quick Start Examples

## Basic Setup

### Server (auth.ts)
```typescript
import { betterAuth } from "better-auth";
import { loginAlias } from "better-auth/plugins";

export const auth = betterAuth({
  database: {
    provider: "postgres",
    url: process.env.DATABASE_URL,
  },
  plugins: [
    loginAlias({
      allowedTypes: ['email', 'username', 'phone'],
      autoCreateAliases: true,
      requireVerification: {
        email: true,
        phone: true,
        username: false
      }
    })
  ]
});
```

### Client (auth-client.ts)
```typescript
import { createAuthClient } from "better-auth/client";
import { loginAliasClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  plugins: [loginAliasClient()]
});
```

## Usage Examples

### 1. List User's Aliases
```typescript
const { data, error } = await authClient.$fetch("/alias/list", {
  method: "GET"
});

console.log(data); 
// [
//   { id: "1", type: "email", value: "user@example.com", verified: true, isPrimary: true },
//   { id: "2", type: "username", value: "johndoe", verified: true, isPrimary: false }
// ]
```

### 2. Add Username Alias
```typescript
const { data, error } = await authClient.$fetch("/alias/add", {
  method: "POST",
  body: {
    type: "username",
    value: "johndoe123",
    verified: true,
    isPrimary: false
  }
});
```

### 3. Add Secondary Email
```typescript
await authClient.$fetch("/alias/add", {
  method: "POST",
  body: {
    type: "email",
    value: "john.doe@company.com",
    verified: false  // Needs verification
  }
});
```

### 4. Add Phone Number
```typescript
await authClient.$fetch("/alias/add", {
  method: "POST",
  body: {
    type: "phone",
    value: "+1-555-123-4567",
    verified: false
  }
});
// Phone is auto-normalized to: 15551234567
```

### 5. Make an Alias Primary
```typescript
await authClient.$fetch("/alias/make-primary", {
  method: "POST",
  body: {
    aliasId: "alias-id-here"
  }
});
```

### 6. Remove an Alias
```typescript
await authClient.$fetch("/alias/remove", {
  method: "POST",
  body: {
    aliasId: "alias-id-here"
  }
});
```

### 7. Sign In with Username Instead of Email
```typescript
// User signed up with email: user@example.com
// They added username: johndoe

// Now they can sign in with either:
await authClient.signIn.email({
  email: "user@example.com",  // Original email
  password: "password123"
});

// OR with username:
await authClient.signIn.email({
  email: "johndoe",  // Username is treated as alias
  password: "password123"
});
```

## React Component Example

```tsx
import { useState, useEffect } from 'react';
import { authClient } from './auth-client';

function AliasManager() {
  const [aliases, setAliases] = useState([]);
  const [username, setUsername] = useState('');

  useEffect(() => {
    loadAliases();
  }, []);

  async function loadAliases() {
    const res = await authClient.$fetch("/alias/list", { method: "GET" });
    if (res.data) setAliases(res.data);
  }

  async function addUsername() {
    const res = await authClient.$fetch("/alias/add", {
      method: "POST",
      body: { type: "username", value: username, verified: true }
    });
    
    if (!res.error) {
      setUsername('');
      loadAliases();
    }
  }

  return (
    <div>
      <h2>Your Login Methods</h2>
      <ul>
        {aliases.map(alias => (
          <li key={alias.id}>
            {alias.type}: {alias.value} 
            {alias.isPrimary && " (Primary)"}
            {alias.verified && " ✓"}
          </li>
        ))}
      </ul>

      <input 
        value={username}
        onChange={e => setUsername(e.target.value)}
        placeholder="Add username"
      />
      <button onClick={addUsername}>Add Username</button>
    </div>
  );
}
```

## Use Cases

### Multi-Email Enterprise Users
```typescript
// Work email (primary)
await authClient.$fetch("/alias/add", {
  method: "POST",
  body: { type: "email", value: "john@company.com", isPrimary: true }
});

// Personal email (backup)
await authClient.$fetch("/alias/add", {
  method: "POST",
  body: { type: "email", value: "john@gmail.com" }
});
```

### Student ID System
```typescript
await authClient.$fetch("/alias/add", {
  method: "POST",
  body: { 
    type: "custom",
    value: "student-12345",
    verified: true,
    metadata: { displayValue: "Student ID: 12345" }
  }
});
```

### Migration from Username to Email
```typescript
// Legacy system used usernames
// New system uses email
// Support both during migration:

await authClient.$fetch("/alias/add", {
  method: "POST",
  body: { type: "email", value: "user@example.com", isPrimary: true }
});

await authClient.$fetch("/alias/add", {
  method: "POST",
  body: { type: "username", value: "legacy_username", isPrimary: false }
});
```

## Database Queries

```typescript
// Direct database access (server-side)
import { auth } from './auth';

const ctx = await auth.$context;

// Find all aliases for a user
const aliases = await ctx.adapter.findMany({
  model: 'loginAlias',
  where: [{ field: 'userId', value: userId }]
});

// Find user by any alias
const alias = await ctx.adapter.findOne({
  model: 'loginAlias',
  where: [{ field: 'value', value: 'johndoe' }]
});
```

