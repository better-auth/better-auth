---
"better-auth": major
---

Native change-email flow via Verification table.

**Breaking changes:**

- Removed `user.changeEmail.sendChangeEmailConfirmation` — replaced by `user.changeEmail.sendVerificationEmail`
- Removed `user.changeEmail.updateEmailWithoutVerification` — no longer supported
- The change-email flow no longer uses `emailVerification.sendVerificationEmail`; it now has its own dedicated sending callback

### New flow

1. `POST /change-email` → stores `pendingEmail` on the user + creates a `Verification` entry → sends email via `changeEmail.sendVerificationEmail`
2. User clicks the link → `GET /verify-email-change/:userId/:token` → verifies token, updates email, deletes Verification entry, creates new session
3. (Optional) `POST /cancel-email-change` → deletes Verification entry + clears `pendingEmail`

### New `pendingEmail` field

Conditionally added to the `user` table when `changeEmail.enabled: true`. Read-only (`input: false`), not directly modifiable via API. Run the CLI to generate the migration.

### Dedicated sending callback

- `sendVerificationEmail` — in `user.changeEmail`, replaces the dependency on `emailVerification.sendVerificationEmail`. Allows a distinct email template for email change vs account verification.

### Lifecycle callbacks

- `onChangeEmailRequested({ user, newEmail }, request)` — when the change is requested
- `onChangeEmailCompleted({ user, oldEmail, newEmail }, request)` — when the change is verified and applied
- `onChangeEmailCancelled({ user }, request)` — when the change is cancelled

### Options

- `revokeOtherSessions: true` — revokes all other sessions after email change

### Migration example

```ts
// Before
user: {
    changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => { ... },
    },
},
emailVerification: {
    sendVerificationEmail: async ({ user, url }) => { ... },
},

// After
user: {
    changeEmail: {
        enabled: true,
        sendVerificationEmail: async ({ user, url }, request) => { ... },
    },
},
```
