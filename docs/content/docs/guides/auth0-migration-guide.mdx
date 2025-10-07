---
title: Migrating from Auth0 to Better Auth
description: A step-by-step guide to transitioning from Auth0 to Better Auth.
---

In this guide, we'll walk through the steps to migrate a project from Auth0 to Better Auth — including email/password with proper hashing, social/external accounts, two-factor authentication, and more.

<Callout type="warn">
This migration will invalidate all active sessions. This guide doesn't currently show you how to migrate Organizations but it should be possible with additional steps and the [Organization](/docs/plugins/organization) Plugin.
</Callout>

## Before You Begin

Before starting the migration process, set up Better Auth in your project. Follow the [installation guide](/docs/installation) to get started.

<Steps>
<Step>
### Connect to your database

You'll need to connect to your database to migrate the users and accounts. You can use any database you want, but for this example, we'll use PostgreSQL.

```package-install
npm install pg
```

And then you can use the following code to connect to your database.

```ts title="auth.ts"
import { Pool } from "pg";

export const auth = betterAuth({
    database: new Pool({ 
        connectionString: process.env.DATABASE_URL 
    }),
})
```
</Step>
<Step>
### Enable Email and Password (Optional)

Enable the email and password in your auth config and implement your own logic for sending verification emails, reset password emails, etc.

```ts title="auth.ts"
import { betterAuth } from "better-auth";

export const auth = betterAuth({
    database: new Pool({ 
        connectionString: process.env.DATABASE_URL 
    }),
    emailAndPassword: { // [!code highlight]
        enabled: true, // [!code highlight]
    }, // [!code highlight]
    emailVerification: {
      sendVerificationEmail: async({ user, url })=>{
        // implement your logic here to send email verification
      }
    },
})
```

See [Email and Password](/docs/authentication/email-password) for more configuration options.
</Step>
<Step>
### Setup Social Providers (Optional)

Add social providers you have enabled in your Auth0 project in your auth config.

```ts title="auth.ts"
import { betterAuth } from "better-auth";

export const auth = betterAuth({
    database: new Pool({ 
        connectionString: process.env.DATABASE_URL 
    }),
    emailAndPassword: { 
        enabled: true,
    },
    socialProviders: { // [!code highlight]
        google: { // [!code highlight]
            clientId: process.env.GOOGLE_CLIENT_ID, // [!code highlight]
            clientSecret: process.env.GOOGLE_CLIENT_SECRET, // [!code highlight]
        }, // [!code highlight]
        github: { // [!code highlight]
            clientId: process.env.GITHUB_CLIENT_ID, // [!code highlight]
            clientSecret: process.env.GITHUB_CLIENT_SECRET, // [!code highlight]
        } // [!code highlight]
    } // [!code highlight]
})
```
</Step>
<Step>
### Add Plugins (Optional)

You can add the following plugins to your auth config based on your needs.

[Admin](/docs/plugins/admin) Plugin will allow you to manage users, user impersonations and app level roles and permissions.

[Two Factor](/docs/plugins/2fa) Plugin will allow you to add two-factor authentication to your application.

[Username](/docs/plugins/username) Plugin will allow you to add username authentication to your application.

```ts title="auth.ts"
import { Pool } from "pg";
import { betterAuth } from "better-auth";
import { admin, twoFactor, username } from "better-auth/plugins";

export const auth = betterAuth({
    database: new Pool({ 
        connectionString: process.env.DATABASE_URL 
    }),
    emailAndPassword: { 
        enabled: true,
        password: {
            verify: (data) => {
                // this for an edgecase that you might run in to on verifying the password
            }
        }
    },
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
        github: {
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        }
    },
    plugins: [admin(), twoFactor(), username()], // [!code highlight]
})
```
</Step>
<Step>
### Generate Schema

If you're using a custom database adapter, generate the schema:

```sh
npx @better-auth/cli generate
```

or if you're using the default adapter, you can use the following command:

```sh
npx @better-auth/cli migrate
```
</Step>
<Step>
### Install Dependencies

Install the required dependencies for the migration:

```bash
npm install auth0
```
</Step>
<Step>
### Create the migration script

Create a new file called `migrate-auth0.ts` in the `scripts` folder and add the following code:

<Callout type="info">
Instead of using the Management API, you can use Auth0's bulk user export functionality and pass the exported JSON data directly to the `auth0Users` array. This is especially useful if you need to migrate password hashes and complete user data, which are not available through the Management API.

**Important Notes:**
- Password hashes export is only available for Auth0 Enterprise users
- Free plan users cannot export password hashes and will need to request a support ticket
- For detailed information about bulk user exports, see the [Auth0 Bulk User Export Documentation](https://auth0.com/docs/manage-users/user-migration/bulk-user-exports)
- For password hash export details, refer to [Exporting Password Hashes](https://auth0.com/docs/troubleshoot/customer-support/manage-subscriptions/export-data#user-passwords)

Example:
```ts
// Replace this with your exported users JSON data
const auth0Users = [
  {
    "email": "helloworld@gmail.com",
    "email_verified": false,
    "name": "Hello world",
    // Note: password_hash is only available for Enterprise users
    "password_hash": "$2b$10$w4kfaZVjrcQ6ZOMiG.M8JeNvnVQkPKZV03pbDUHbxy9Ug0h/McDXi",
    // ... other user data
  }
];
```
</Callout>

```ts title="scripts/migrate-auth0.ts"
import { ManagementClient } from 'auth0';
import { generateRandomString, symmetricEncrypt } from "better-auth/crypto";
import { auth } from '@/lib/auth';

const auth0Client = new ManagementClient({
    domain: process.env.AUTH0_DOMAIN!,
    clientId: process.env.AUTH0_CLIENT_ID!,
    clientSecret: process.env.AUTH0_SECRET!,
});



function safeDateConversion(timestamp?: string | number): Date {
    if (!timestamp) return new Date();

    const numericTimestamp = typeof timestamp === 'string' ? Date.parse(timestamp) : timestamp;

    const milliseconds = numericTimestamp < 1000000000000 ? numericTimestamp * 1000 : numericTimestamp;

    const date = new Date(milliseconds);

    if (isNaN(date.getTime())) {
        console.warn(`Invalid timestamp: ${timestamp}, falling back to current date`);
        return new Date();
    }

    // Check for unreasonable dates (before 2000 or after 2100)
    const year = date.getFullYear();
    if (year < 2000 || year > 2100) {
        console.warn(`Suspicious date year: ${year}, falling back to current date`);
        return new Date();
    }

    return date;
}

// Helper function to generate backup codes for 2FA
async function generateBackupCodes(secret: string) {
    const key = secret;
    const backupCodes = Array.from({ length: 10 })
        .fill(null)
        .map(() => generateRandomString(10, "a-z", "0-9", "A-Z"))
        .map((code) => `${code.slice(0, 5)}-${code.slice(5)}`);

    const encCodes = await symmetricEncrypt({
        data: JSON.stringify(backupCodes),
        key: key,
    });
    return encCodes;
}

function mapAuth0RoleToBetterAuthRole(auth0Roles: string[]) {
    if (typeof auth0Roles === 'string') return auth0Roles;
    if (Array.isArray(auth0Roles)) return auth0Roles.join(',');
}
// helper function to migrate password from auth0 to better auth for custom hashes and algs
async function migratePassword(auth0User: any) {
    if (auth0User.password_hash) {
        if (auth0User.password_hash.startsWith('$2a$') || auth0User.password_hash.startsWith('$2b$')) {
            return auth0User.password_hash;
        }
    }

    if (auth0User.custom_password_hash) {
        const customHash = auth0User.custom_password_hash;

        if (customHash.algorithm === 'bcrypt') {
            const hash = customHash.hash.value;
            if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
                return hash;
            }
        }

        return JSON.stringify({
            algorithm: customHash.algorithm,
            hash: {
                value: customHash.hash.value,
                encoding: customHash.hash.encoding || 'utf8',
                ...(customHash.hash.digest && { digest: customHash.hash.digest }),
                ...(customHash.hash.key && {
                    key: {
                        value: customHash.hash.key.value,
                        encoding: customHash.hash.key.encoding || 'utf8'
                    }
                })
            },
            ...(customHash.salt && {
                salt: {
                    value: customHash.salt.value,
                    encoding: customHash.salt.encoding || 'utf8',
                    position: customHash.salt.position || 'prefix'
                }
            }),
            ...(customHash.password && {
                password: {
                    encoding: customHash.password.encoding || 'utf8'
                }
            }),
            ...(customHash.algorithm === 'scrypt' && {
                keylen: customHash.keylen,
                cost: customHash.cost || 16384,
                blockSize: customHash.blockSize || 8,
                parallelization: customHash.parallelization || 1
            })
        });
    }

    return null;
}

async function migrateMFAFactors(auth0User: any, userId: string | undefined, ctx: any) {
    if (!userId || !auth0User.mfa_factors || !Array.isArray(auth0User.mfa_factors)) {
        return;
    }

    for (const factor of auth0User.mfa_factors) {
        try {
            if (factor.totp && factor.totp.secret) {
                await ctx.adapter.create({
                    model: "twoFactor",
                    data: {
                        userId: userId,
                        secret: factor.totp.secret,
                        backupCodes: await generateBackupCodes(factor.totp.secret)
                    }
                });
            }
        } catch (error) {
            console.error(`Failed to migrate MFA factor for user ${userId}:`, error);
        }
    }
}

async function migrateOAuthAccounts(auth0User: any, userId: string | undefined, ctx: any) {
    if (!userId || !auth0User.identities || !Array.isArray(auth0User.identities)) {
        return;
    }

    for (const identity of auth0User.identities) {
        try {
            const providerId = identity.provider === 'auth0' ? "credential" : identity.provider.split("-")[0];
            await ctx.adapter.create({
                model: "account",
                data: {
                    id: `${auth0User.user_id}|${identity.provider}|${identity.user_id}`,
                    userId: userId,
                    password: await migratePassword(auth0User),
                    providerId: providerId || identity.provider,
                    accountId: identity.user_id,
                    accessToken: identity.access_token,
                    tokenType: identity.token_type,
                    refreshToken: identity.refresh_token,
                    accessTokenExpiresAt: identity.expires_in ? new Date(Date.now() + identity.expires_in * 1000) : undefined,
                    // if you are enterprise user, you can get the refresh tokens or all the tokensets - auth0Client.users.getAllTokensets 
                    refreshTokenExpiresAt: identity.refresh_token_expires_in ? new Date(Date.now() + identity.refresh_token_expires_in * 1000) : undefined,

                    scope: identity.scope,
                    idToken: identity.id_token,
                    createdAt: safeDateConversion(auth0User.created_at),
                    updatedAt: safeDateConversion(auth0User.updated_at)
                },
                forceAllowId: true
            }).catch((error: Error) => {
                console.error(`Failed to create OAuth account for user ${userId} with provider ${providerId}:`, error);
                return ctx.adapter.create({
                    // Try creating without optional fields if the first attempt failed
                    model: "account",
                    data: {
                        id: `${auth0User.user_id}|${identity.provider}|${identity.user_id}`,
                        userId: userId,
                        password: migratePassword(auth0User),
                        providerId: providerId,
                        accountId: identity.user_id,
                        accessToken: identity.access_token,
                        tokenType: identity.token_type,
                        refreshToken: identity.refresh_token,
                        accessTokenExpiresAt: identity.expires_in ? new Date(Date.now() + identity.expires_in * 1000) : undefined,
                        refreshTokenExpiresAt: identity.refresh_token_expires_in ? new Date(Date.now() + identity.refresh_token_expires_in * 1000) : undefined,
                        scope: identity.scope,
                        idToken: identity.id_token,
                        createdAt: safeDateConversion(auth0User.created_at),
                        updatedAt: safeDateConversion(auth0User.updated_at)
                    },
                    forceAllowId: true
                });
            });

            console.log(`Successfully migrated OAuth account for user ${userId} with provider ${providerId}`);
        } catch (error) {
            console.error(`Failed to migrate OAuth account for user ${userId}:`, error);
        }
    }
}

async function migrateOrganizations(ctx: any) {
    try {
        const organizations = await auth0Client.organizations.getAll();
        for (const org of organizations.data || []) {
            try {
                await ctx.adapter.create({
                    model: "organization",
                    data: {
                        id: org.id,
                        name: org.display_name || org.id,
                        slug: (org.display_name || org.id).toLowerCase().replace(/[^a-z0-9]/g, '-'),
                        logo: org.branding?.logo_url,
                        metadata: JSON.stringify(org.metadata || {}),
                        createdAt: safeDateConversion(org.created_at),
                    },
                    forceAllowId: true
                });
                const members = await auth0Client.organizations.getMembers({ id: org.id });
                for (const member of members.data || []) {
                    try {
                        const userRoles = await auth0Client.organizations.getMemberRoles({
                            id: org.id,
                            user_id: member.user_id
                        });
                        const role = mapAuth0RoleToBetterAuthRole(userRoles.data?.map(r => r.name) || []);
                        await ctx.adapter.create({
                            model: "member",
                            data: {
                                id: `${org.id}|${member.user_id}`,
                                organizationId: org.id,
                                userId: member.user_id,
                                role: role,
                                createdAt: new Date()
                            },
                            forceAllowId: true
                        });

                        console.log(`Successfully migrated member ${member.user_id} for organization ${org.display_name || org.id}`);
                    } catch (error) {
                        console.error(`Failed to migrate member ${member.user_id} for organization ${org.display_name || org.id}:`, error);
                    }
                }

                console.log(`Successfully migrated organization: ${org.display_name || org.id}`);
            } catch (error) {
                console.error(`Failed to migrate organization ${org.display_name || org.id}:`, error);
            }
        }
        console.log('Organization migration completed');
    } catch (error) {
        console.error('Failed to migrate organizations:', error);
    }
}

async function migrateFromAuth0() {
    try {
        const ctx = await auth.$context;
        const isAdminEnabled = ctx.options?.plugins?.find(plugin => plugin.id === "admin");
        const isUsernameEnabled = ctx.options?.plugins?.find(plugin => plugin.id === "username");
        const isOrganizationEnabled = ctx.options?.plugins?.find(plugin => plugin.id === "organization");
        const perPage = 100;
        const auth0Users: any[] = [];
        let pageNumber = 0;

        while (true) {
            try {
                const params = {
                    per_page: perPage,
                    page: pageNumber,
                    include_totals: true,
                };
                const response = (await auth0Client.users.getAll(params)).data as any;
                const users = response.users || [];
                if (users.length === 0) break;
                auth0Users.push(...users);
                pageNumber++;

                if (users.length < perPage) break;
            } catch (error) {
                console.error('Error fetching users:', error);
                break;
            }
        }


        console.log(`Found ${auth0Users.length} users to migrate`);

        for (const auth0User of auth0Users) {
            try {
                // Determine if this is a password-based or OAuth user
                const isOAuthUser = auth0User.identities?.some((identity: any) => identity.provider !== 'auth0');
                // Base user data that's common for both types
                const baseUserData = {
                    id: auth0User.user_id,
                    email: auth0User.email,
                    emailVerified: auth0User.email_verified || false,
                    name: auth0User.name || auth0User.nickname,
                    image: auth0User.picture,
                    createdAt: safeDateConversion(auth0User.created_at),
                    updatedAt: safeDateConversion(auth0User.updated_at),
                    ...(isAdminEnabled ? {
                        banned: auth0User.blocked || false,
                        role: mapAuth0RoleToBetterAuthRole(auth0User.roles || []),
                    } : {}),

                    ...(isUsernameEnabled ? {
                        username: auth0User.username || auth0User.nickname,
                    } : {}),

                };

                const createdUser = await ctx.adapter.create({
                    model: "user",
                    data: {
                        ...baseUserData,
                    },
                    forceAllowId: true
                });

                if (!createdUser?.id) {
                    throw new Error('Failed to create user');
                }


                await migrateOAuthAccounts(auth0User, createdUser.id, ctx)
                console.log(`Successfully migrated user: ${auth0User.email}`);
            } catch (error) {
                console.error(`Failed to migrate user ${auth0User.email}:`, error);
            }
        }
        if (isOrganizationEnabled) {
            await migrateOrganizations(ctx);
        }
        // the reset of migration will be here.
        console.log('Migration completed successfully');
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
}

migrateFromAuth0()
    .then(() => {
        console.log('Migration completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    }); 
```

Make sure to replace the Auth0 environment variables with your own values:
- `AUTH0_DOMAIN`
- `AUTH0_CLIENT_ID`
- `AUTH0_SECRET`
</Step>

<Step>
### Run the migration

Run the migration script:

```sh
bun run scripts/migrate-auth0.ts # or use your preferred runtime
```

<Callout type="warning">
Important considerations:
1. Test the migration in a development environment first
2. Monitor the migration process for any errors
3. Verify the migrated data in Better Auth before proceeding
4. Keep Auth0 installed and configured until the migration is complete
5. The script handles bcrypt password hashes by default. For custom password hashing algorithms, you'll need to modify the `migratePassword` function
</Callout>

</Step>

<Step>
 ### Change password hashing algorithm

 By default, Better Auth uses the `scrypt` algorithm to hash passwords. Since Auth0 uses `bcrypt`, you'll need to configure Better Auth to use bcrypt for password verification.

 First, install bcrypt:

 ```bash
 npm install bcrypt
 npm install -D @types/bcrypt
 ```

 Then update your auth configuration:

 ```ts title="auth.ts"
 import { betterAuth } from "better-auth";
 import bcrypt from "bcrypt";
 
 export const auth = betterAuth({
    emailAndPassword: {
        password: {
            hash: async (password) => {
                return await bcrypt.hash(password, 10);
            },
            verify: async ({ hash, password }) => {
                return await bcrypt.compare(password, hash);
            }
        }
    }
 })
 ```
</Step>
<Step>
### Verify the migration

After running the migration, verify that:
1. All users have been properly migrated
2. Social connections are working
3. Password-based authentication is working
4. Two-factor authentication settings are preserved (if enabled)
5. User roles and permissions are correctly mapped
</Step>
<Step>
### Update your components

Now that the data is migrated, update your components to use Better Auth. Here's an example for the sign-in component:

```tsx title="components/auth/sign-in.tsx"
import { authClient } from "better-auth/client";

export const SignIn = () => {
  const handleSignIn = async () => {
    const { data, error } = await authClient.signIn.email({
      email: "helloworld@gmail.com",
      password: "helloworld",
    });
    
    if (error) {
      console.error(error);
      return;
    }
    // Handle successful sign in
  };

  return (
    <form onSubmit={handleSignIn}>
      <button type="submit">Sign in</button>
    </form>
  );
};
```
</Step>
<Step>
### Update the middleware

Replace your Auth0 middleware with Better Auth's middleware:

```ts title="middleware.ts"
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  if (sessionCookie && ["/login", "/signup"].includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!sessionCookie && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/login", "/signup"],
};
```
</Step>
<Step>
### Remove Auth0 Dependencies

Once you've verified everything is working correctly with Better Auth, remove Auth0:

```bash
npm remove @auth0/auth0-react @auth0/auth0-spa-js @auth0/nextjs-auth0
```
</Step>
</Steps>

## Additional Considerations

### Password Migration
The migration script handles bcrypt password hashes by default. If you're using custom password hashing algorithms in Auth0, you'll need to modify the `migratePassword` function in the migration script to handle your specific case.

### Role Mapping
The script includes a basic role mapping function (`mapAuth0RoleToBetterAuthRole`). Customize this function based on your Auth0 roles and Better Auth role requirements.

### Rate Limiting
The migration script includes pagination to handle large numbers of users. Adjust the `perPage` value based on your needs and Auth0's rate limits.

## Wrapping Up

Now! You've successfully migrated from Auth0 to Better Auth.

Better Auth offers greater flexibility and more features—be sure to explore the [documentation](/docs) to unlock its full potential. 