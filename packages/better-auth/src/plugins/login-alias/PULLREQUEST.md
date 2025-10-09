# Pull Request: Login Aliases Support

## 🎯 Summary

This PR adds a new **Login Aliases** plugin that allows users to have multiple login identifiers (email, username, phone, etc.) all pointing to the same account. This is particularly useful for large applications with multiple identity integrations.

## 🚀 What's New

### Core Features
- ✅ Multiple login methods per user account
- ✅ Support for email, username, phone, and custom alias types
- ✅ Automatic alias creation on sign-up
- ✅ Sign-in with any verified alias
- ✅ Alias verification system
- ✅ Primary alias management
- ✅ Value normalization and validation
- ✅ Type-safe client SDK

### API Endpoints
- `GET /alias/list` - List all aliases for current user
- `POST /alias/add` - Add a new alias
- `POST /alias/remove` - Remove an alias
- `POST /alias/make-primary` - Set an alias as primary
- `POST /alias/verify` - Mark an alias as verified
- `POST /alias/find-user` - Find user by alias (internal)

## 📦 Files Added

```
packages/better-auth/src/plugins/login-alias/
├── index.ts                 # Main plugin implementation
├── schema.ts                # Database schema & types
├── types.ts                 # TypeScript interfaces
├── client.ts                # Client SDK
├── utils.ts                 # Helper utilities
├── error-codes.ts           # Error constants
├── sign-in-helper.ts        # Sign-in integration helpers
├── login-alias.test.ts      # Comprehensive tests
├── EXAMPLE.md               # Usage examples
└── PULLREQUEST.md           # This file
```

## 💾 Database Schema

Adds a new `loginAlias` table:

```typescript
{
  id: string              // Primary key
  userId: string          // Foreign key to user
  type: string            // 'email' | 'username' | 'phone' | 'custom'
  value: string           // The identifier (normalized)
  verified: boolean       // Verification status
  isPrimary: boolean      // Primary alias flag
  metadata: string        // JSON metadata (optional)
  createdAt: Date
  updatedAt: Date
}
```

## 🔧 Usage

### Server Setup
```typescript
import { betterAuth } from "better-auth";
import { loginAlias } from "better-auth/plugins";

export const auth = betterAuth({
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

### Client Setup
```typescript
import { createAuthClient } from "better-auth/client";
import { loginAliasClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  plugins: [loginAliasClient()]
});
```

### Adding an Alias
```typescript
await authClient.$fetch("/alias/add", {
  method: "POST",
  body: {
    type: "username",
    value: "johndoe",
    verified: true
  }
});
```

### Sign In with Alias
```typescript
// User can now sign in with username instead of email
await authClient.signIn.email({
  email: "johndoe",  // Username is resolved to email
  password: "password123"
});
```

## 🎨 Key Design Decisions

1. **Normalization**: Values are normalized (lowercase emails/usernames, digits-only phones) to prevent duplicates
2. **Verification**: Sensitive alias types (email, phone) require verification by default
3. **Primary Flag**: Each alias type can have one primary alias
4. **Auto-Creation**: Email aliases are auto-created on sign-up when enabled
5. **Hooks Integration**: Uses before/after hooks to intercept sign-in and auto-resolve aliases
6. **Safety**: Users cannot remove their last login method

## ✅ Testing

Comprehensive test suite includes:
- ✅ Auto-creation of aliases on sign-up
- ✅ Listing user aliases
- ✅ Adding new aliases
- ✅ Duplicate prevention
- ✅ Making aliases primary
- ✅ Removing aliases
- ✅ Protection against removing last login method
- ✅ Alias verification
- ✅ Finding users by alias
- ✅ Sign-in with alias instead of email
- ✅ Value validation
- ✅ Value normalization
- ✅ Max aliases per user limit

Run tests:
```bash
npm test packages/better-auth/src/plugins/login-alias/login-alias.test.ts
```

## 🔄 Migration

For existing users, you can run a migration to create aliases:

```typescript
// Example migration script
const users = await ctx.internalAdapter.listUsers();

for (const user of users) {
  await ctx.adapter.create({
    model: 'loginAlias',
    data: {
      userId: user.id,
      type: 'email',
      value: user.email.toLowerCase(),
      verified: user.emailVerified,
      isPrimary: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });
}
```

## 🚨 Breaking Changes

**None** - This is a new plugin and completely opt-in.

## 📚 Documentation

- See `EXAMPLE.md` for detailed usage examples
- All functions and types are fully documented with JSDoc comments
- TypeScript types are exported for type safety

## 🎯 Use Cases

1. **Enterprise Applications**: Users with work and personal emails
2. **Migration**: Supporting both legacy username and new email-based login
3. **Multi-Region**: Different phone numbers or emails per region
4. **Student Systems**: Student ID + email + username
5. **Social Platforms**: Username + email + phone number

## 🔍 Related Issues

Closes #[issue-number] - Add support for multiple login methods per user

## 📋 Checklist

- ✅ Code follows project style guidelines
- ✅ All linter errors resolved
- ✅ Comprehensive tests added and passing
- ✅ Documentation provided (EXAMPLE.md)
- ✅ Type-safe implementation
- ✅ Client SDK included
- ✅ Exports added to plugin index
- ✅ No breaking changes
- ✅ Backward compatible

## 🤝 Reviewers

@[maintainer-username] - Please review the plugin architecture and database schema
@[maintainer-username] - Please review the sign-in integration hooks

## 💡 Future Enhancements

Potential follow-up PRs:
- Email/SMS verification flow for new aliases
- Alias linking UI components
- Admin API for managing user aliases
- Alias usage analytics
- Bulk alias operations

## 📸 Screenshots

N/A - This is a backend plugin. See `EXAMPLE.md` for React component examples.

---

**Note**: This plugin is fully backward compatible and requires no changes to existing code unless users want to enable the feature.

