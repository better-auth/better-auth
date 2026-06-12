# Password History Plugin

A Better Auth plugin that prevents users from reusing their previous passwords, enhancing security by enforcing password rotation policies.

## Features

- ✅ **Prevents password reuse**: Blocks users from reusing their current or recent passwords
- ✅ **Configurable history**: Set how many previous passwords to check (default: 5)
- ✅ **Multiple endpoint support**: Works with password change, reset, and set endpoints
- ✅ **Automatic cleanup**: Removes old password history entries beyond the configured limit
- ✅ **Custom error messages**: Provide your own error messages for password reuse
- ✅ **Flexible path configuration**: Choose which endpoints to enforce password history checks
- ✅ **Graceful error handling**: Doesn't block password changes if history check fails

## Installation

The plugin is included with Better Auth. No additional installation required.

## Usage

### Basic Setup

```typescript
import { betterAuth } from "better-auth";
import { passwordHistory } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [
    passwordHistory()
  ],
  // ... other config
});
```

### With Custom Options

```typescript
import { betterAuth } from "better-auth";
import { passwordHistory } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [
    passwordHistory({
      historyCount: 10, // Check last 10 passwords
      customPasswordReusedMessage: "You cannot reuse your last 10 passwords!",
      paths: ["/change-password", "/reset-password"] // Only check these endpoints
    })
  ],
  // ... other config
});
```

## Configuration Options

### `historyCount`

**Type:** `number`  
**Default:** `5`

The number of previous passwords to check against when a user tries to change their password.

```typescript
passwordHistory({
  historyCount: 10 // Check last 10 passwords
})
```

### `customPasswordReusedMessage`

**Type:** `string | undefined`  
**Default:** `undefined`

Custom error message to display when a user tries to reuse a password. If not provided, uses the default message: "This password has been used recently. Please choose a different password."

```typescript
passwordHistory({
  customPasswordReusedMessage: "You cannot reuse your last 5 passwords!"
})
```

### `paths`

**Type:** `string[]`  
**Default:** `["/change-password", "/reset-password", "/set-password"]`

Array of API paths where password history checks should be enforced. Only these endpoints will trigger password history validation.

```typescript
passwordHistory({
  paths: ["/change-password"] // Only check on password change, not reset
})
```

## Database Schema

The plugin automatically creates a `passwordHistory` table with the following structure:

```typescript
{
  userId: string;        // References user.id (cascade delete)
  passwordHash: string;  // Hashed password (not returned)
  createdAt: Date;       // Timestamp of when password was set
}
```

The schema is automatically applied when you initialize Better Auth with this plugin.

## How It Works

1. **Password Storage**: When a user changes their password (via any configured endpoint), the plugin automatically stores the hashed password in the `passwordHistory` table.

2. **Password Validation**: Before allowing a password change, the plugin:
   - Checks if the new password matches the current password
   - Checks if the new password matches any of the previous passwords in history (up to `historyCount`)
   - Uses secure password verification to compare hashes

3. **Automatic Cleanup**: When storing a new password, the plugin automatically removes entries beyond the `historyCount` limit, keeping only the most recent passwords.

4. **Error Handling**: If a password reuse is detected, the plugin throws a `BAD_REQUEST` error with code `PASSWORD_REUSED`. If the history check fails for any reason, it doesn't block the password change to ensure availability.

## Supported Endpoints

The plugin works with the following Better Auth endpoints by default:

- `/change-password` - When users change their password while logged in
- `/reset-password` - When users reset their password via reset token
- `/set-password` - When users set their password for the first time

You can customize which endpoints are checked using the `paths` option.

## Error Codes

The plugin exports the following error code:

- `PASSWORD_REUSED` - Returned when a user tries to reuse a password that's in their history

```typescript
import { passwordHistory } from "better-auth/plugins";

// Access error codes
const errorCodes = passwordHistory().$ERROR_CODES;
// { PASSWORD_REUSED: { code: "PASSWORD_REUSED", message: "..." } }
```

## Examples

### Example 1: Strict Password Policy

Enforce checking the last 10 passwords with a custom message:

```typescript
passwordHistory({
  historyCount: 10,
  customPasswordReusedMessage: "For security reasons, you cannot reuse any of your last 10 passwords."
})
```

### Example 2: Only Check on Password Change

Only enforce history checks when users change their password (not on reset):

```typescript
passwordHistory({
  historyCount: 5,
  paths: ["/change-password"]
})
```

### Example 3: Handle Password Reuse Error

```typescript
const result = await client.changePassword({
  currentPassword: "oldPassword",
  newPassword: "reusedPassword"
});

if (result.error?.code === "PASSWORD_REUSED") {
  console.log("Cannot reuse password:", result.error.message);
}
```

## Security Considerations

- **Password Hashing**: The plugin stores password hashes, never plain text passwords
- **Secure Verification**: Uses Better Auth's built-in password verification for secure comparison
- **Cascade Deletion**: Password history is automatically deleted when a user is deleted
- **Error Handling**: History check failures don't block password changes to prevent availability issues

## Testing

The plugin includes comprehensive tests covering:
- First password change (no history)
- Current password reuse prevention
- Previous password reuse prevention
- Password reuse after history expires
- Reset password endpoint
- Custom error messages
- Custom path configuration

## Notes

- The plugin automatically handles password history storage via database hooks
- Password history is checked before the password is changed
- The new password is stored in history after validation passes
- Users without password history can still change their passwords normally

