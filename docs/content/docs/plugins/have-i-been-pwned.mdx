---
title: Have I Been Pwned
description: A plugin to check if a password has been compromised
---

The Have I Been Pwned plugin helps protect user accounts by preventing the use of passwords that have been exposed in known data breaches. It uses the [Have I Been Pwned](https://haveibeenpwned.com/) API to check if a password has been compromised.

## Installation

### Add the plugin to your **auth** config
```ts title="auth.ts"
import { betterAuth } from "better-auth"
import { haveIBeenPwned } from "better-auth/plugins" // [!code highlight]

export const auth = betterAuth({
    plugins: [
        haveIBeenPwned()
    ]
})
```

## Usage

When a user attempts to create an account or update their password with a compromised password, they'll receive the following default error:

```json
{
  "code": "PASSWORD_COMPROMISED",
  "message": "Password is compromised"
}
```

## Config

You can customize the error message:

```ts
haveIBeenPwned({
    customPasswordCompromisedMessage: "Please choose a more secure password."
})
```
## Security Notes

- Only the first 5 characters of the password hash are sent to the API
- The full password is never transmitted
- Provides an additional layer of account security