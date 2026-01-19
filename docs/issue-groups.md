# Better Auth Issue Groups

Categorized from 339 open issues, sorted by score (reactions + comments + recency).

---

## Identified Duplicates

After reviewing issues in detail, these exact duplicates were found:

| Duplicate | Original | Description |
|-----------|----------|-------------|
| #7383 | #5830 | Admin Dashboard UI - both request built-in dashboard for user management |
| #4498 | #1495 | Multiple Google Client IDs - both request support for iOS/Android/Web client IDs |

---

## Organization Plugin
Core organization features, teams, roles, and invitations.

| Score | Issue | Title |
|-------|-------|-------|
| 194 | #2446 | API Key owned by Organization |
| 102 | #2167 | Admin and Organization plugins Attribute Based Access Control |
| 59 | #3672 | Allow users to get invited to an organization without sending emails |
| 57 | #4223 | Invitation workflow |
| 46 | #1595 | Cannot update and delete an organization as user admin |
| 45 | #4746 | Support Tenant/Org-Scoped API Keys in Multi-Tenant Applications |
| 42 | #2955 | Support for Team-Specific Roles |
| 39 | #2010 | Create organization on user sign-up |
| 38 | #5200 | Send Invitation with admin plugin |
| 37 | #4493 | Support for assigning roles to teams |
| 32 | #5706 | Store activeOrganizationSlug and activeOrganizationRole in session |
| 28 | #6716 | Allow unverified users to accept invitations |
| 28 | #6662 | Make the "slug" parameter optional |
| 28 | #6054 | listUserTeams causes error if user is not part of any teams |
| 28 | #6038 | Security: get-full-organization exposes full member list |
| 27 | #1247 | Organization in user object |
| 26 | #1849 | Is a slug field planned for Teams? |
| 21 | #3556 | Incorrect FK reference for the teamMember table |
| 20 | #6768 | Prisma Invalid Invocation for Member Creation |
| 19 | #6772 | Add ability to entirely remove default role |
| 18 | #4708 | Organization set-active endpoint is missing session context |
| 18 | #7012 | allow passing userId for listUserTeams API |

---

## Multi-Tenancy
Tenant isolation, multi-tenant applications, cross-domain auth.

| Score | Issue | Title |
|-------|-------|-------|
| 119 | #1248 | Multi-Tenant userbases / updatable user schema |
| 45 | #4746 | Support Tenant/Org-Scoped API Keys in Multi-Tenant Applications |
| 13 | #4878 | Multi-tenant cross domain situation |

---

## Session Management
Cookies, getSession, session refresh, multi-session issues.

| Score | Issue | Title |
|-------|-------|-------|
| 52 | #2020 | Cookie caching doesn't renew in SvelteKit |
| 41 | #7008 | auth.api.getSession() returns null in Next.js App Router server components |
| 36 | #5875 | Stale client session data after server action login in Next |
| 35 | #2115 | Session cookie maxAge is not refreshed |
| 34 | #1443 | Expo not retaining session or cookie in SecureStore after social auth |
| 33 | #6672 | client.getSession returned null, but session exist |
| 33 | #3851 | Manually Create / Generate Cookie from Session |
| 33 | #6184 | Multi Session plugin creates multiple cookies for the same account |
| 32 | #5378 | Allow excluding user fields from cookie cache to prevent oversized cookies |
| 31 | #7454 | listSessions returns sessions without id field when using secondaryStorage |
| 30 | #4319 | Prefetch session on the backend and pass the promise to the frontend |
| 30 | #4203 | secondaryStorage ttl forces re-login on users |
| 29 | #6583 | getSession behaves differently from the document |
| 29 | #4490 | multiSession: listDeviceSessions() only returns 2 sessions |
| 27 | #6993 | Session ID missing in KV storage when using secondaryStorage |
| 27 | #6810 | Expo: Fail in useSession due to invalid SecureStore cookie |
| 25 | #4188 | auth.api.getSession returns null in Next.js server components |
| 22 | #7394 | Stateless session and refresh token |
| 21 | #6799 | Session refresh writes on GET request |
| 19 | #6289 | The session config not work as expected |
| 18 | #4475 | getSession or useSession not extending expiresAt |

---

## Two-Factor Authentication & Passkeys
2FA, TOTP, passkeys, biometrics.

| Score | Issue | Title |
|-------|-------|-------|
| 85 | #1279 | Allow 2FA activation/deactivation for social login users without password |
| 58 | #4396 | Allow registering passkeys without passwords |
| 40 | #5312 | Add option to enable 2fa by default for any new user |
| 29 | #7463 | [@better-auth/passkeys] TypeError: Reflect.getMetadata is not a function |
| 28 | #6762 | add passkey not working when generateId is set to 'serial' |
| 20 | #7259 | Add hooks for passkey creation, deletion, and updating |
| 19 | #4704 | Biometric Face ID login with Expo |
| 17 | #6192 | Delete verification challenge after use (passkey) |
| 12 | #6000 | Support PIN-based Step-up Authentication for Sensitive Actions |
| 8 | #5738 | Two Factor authentication should support enabling only for the OTP |

---

## OAuth & Social Login
Google, Apple, OAuth flow, social linking, provider configuration.

| Score | Issue | Title |
|-------|-------|-------|
| 72 | #1522 | Apple Authentication client secrets will eventually expire |
| 68 | #1259 | Request: Better logging on generic OAuth flow |
| 63 | #3495 | Sign in with Solana (SIWS) |
| 48 | #1495 | Enable multiple client ids for google provider |
| 43 | #3526 | Sign in with Telegram Login Widget |
| 38 | #2243 | OneTap google signin error |
| 32 | #4728 | Custom fields with Magic Links/Social Sign Up |
| 32 | #3078 | Social sign ins bypasses required fields in user |
| 28 | #6443 | Getting jwt tokens from keycloack |
| 27 | #6738 | SIWX (Sign in with X) |
| 25 | #4628 | Add fillMissingUserInfoOnLink option for selective field updates |
| 25 | #4498 | Support Multiple Google Client IDs for Cross-Platform Token Verification |
| 25 | #6423 | Expired and Rotated OAuth Tokens Are Not Being Deleted |
| 23 | #7375 | Add game accounts as Social Sign-On (Steam / Riot Games / Blizzard) |
| 22 | #5592 | login_hint for social linking (linkSocialAccount) |
| 22 | #6126 | Support for Linking Multiple Login Identities to a Single User |
| 21 | #6582 | Google callbackURL not triggered after full login flow |
| 20 | #7025 | Expo + Express: Google SignIn stuck at Consent screen |
| 20 | #5277 | hard to debug oauth provider errors during getUserInfo |
| 20 | #4459 | How to get email when user does social login with Google |
| 19 | #6392 | Allow explicit 'linkSocial' while disabling implicit auto-linking |
| 19 | #6486 | authorizationUrlParams not being applied in genericOAuth plugin |
| 18 | #5865 | [Feature Request] Keycloak Sign In Provider |

---

## Database Adapters
Drizzle, Prisma, Kysely, MongoDB support.

| Score | Issue | Title |
|-------|-------|-------|
| 59 | #2017 | Generate Kysely migration as typescript |
| 57 | #6766 | Update Drizzle ORM Adapter to support new query syntax |
| 53 | #6469 | Prisma v7: Users not getting updated when using authClient.updateUser() |
| 35 | #7033 | BetterAuth CLI cannot read Prisma client in NestJS project |
| 30 | #6828 | 404 Not Found with Nestjs Prisma v7 |
| 29 | #6820 | Dependency resolution fails with Prisma v7 (ERESOLVE) |
| 28 | #6183 | Make kysely optional |
| 27 | #6606 | CLI generate command: Support for PostgreSQL custom schema (pgSchema) |
| 27 | #7271 | Drizzle adapter drops OR clauses when mixed with AND connectors |
| 26 | #7275 | CLI Incorrectly Stringifies JSON Type Defaults in Drizzle |
| 24 | #5931 | Testing new adapter - test if count is implemented |
| 21 | #7234 | Drizzle Adapter breaks when using Effect-based execution mode |
| 21 | #5770 | PrismaClientValidationError when creating user with MongoDB |
| 21 | #6605 | Amazon DSQL support |
| 21 | #6812 | Support MongoDB driver v7 |
| 20 | #7188 | feat: add adapters related to typeorm |
| 20 | #5657 | No way to get BIGINT columns for IDs? |
| 18 | #5849 | defaultValue is not applying in prisma schema |
| 18 | #7419 | Support { mode: "string" } for timestamps in Drizzle adapter |
| 17 | #7139 | Feat(cli): Support Prisma v7 multi-file schema |

---

## Framework Integration
Next.js, SvelteKit, Expo, TanStack Start, NestJS, Qwik, Vue.

| Score | Issue | Title |
|-------|-------|-------|
| 57 | #1070 | Improve Vue composition hooks api |
| 53 | #4052 | CORS violation even after defining trustedOrigins |
| 52 | #2020 | Cookie caching doesn't renew in SvelteKit |
| 48 | #6636 | [1.4.6] ExpressJS and toNodeHandler gives 404 errors |
| 45 | #3157 | Tanstack Start with SolidJS |
| 42 | #7149 | baseURL validation breaks electron custom protocols |
| 41 | #7008 | auth.api.getSession() returns null in Next.js App Router |
| 39 | #95 | Support for Qwik |
| 38 | #6637 | [1.4.6] Error upgrading to v1.4.6 using Tanstack Start |
| 36 | #5875 | Stale client session data after server action login in Next |
| 30 | #6853 | [Issue] NextJS 16, Server Error |
| 30 | #2732 | Svelte 5 support |
| 29 | #4979 | Tanstack Query queryOptions for frontend client |
| 27 | #6728 | Nest backend setup but sign-up in email failed |
| 26 | #6930 | Integration with Capacitor |
| 25 | #2493 | Corrupted/malformed headers with Expo + Next.js break session |
| 23 | #5639 | Session token cookie not set with reactStartCookies plugin |
| 22 | #4720 | Next.js App Router OPTIONS Preflight Requests Not Honoring trustedOrigins |
| 20 | #7230 | TanStack Start + Convex: SSR auth check runs on every navigation |
| 19 | #7434 | CORS Issues with Better Auth on Cloudflare Workers Using Hono |
| 17 | #6909 | NestJS and Expo: inferred type of 'auth' cannot be named |

---

## Email & Phone OTP / Magic Links
Email verification, OTP, magic links, phone number login.

| Score | Issue | Title |
|-------|-------|-------|
| 48 | #5550 | Magic Link - Option to allow multiple attempts |
| 42 | #6354 | Email OTP issues since 1.4.0 |
| 38 | #2402 | User should be able to sign up with username/email/mobile |
| 38 | #1568 | Email OTP Plugin: Option to Accept Multiple OTPs |
| 36 | #5573 | Email & Password Sign Up/Logout throws 403 MISSING_OR_NULL_ORIGIN |
| 34 | #4702 | Allow better integration with SMS OTP providers |
| 33 | #7348 | APIError thrown in emailOTP.sendVerificationOTP no longer bubbles up |
| 33 | #3742 | Configurable Email-Address Change Verification Flow |
| 32 | #4262 | Expose function to generate verification URL without emailing |
| 28 | #6400 | Email/password sign-in fails when experimental.joins is enabled |
| 26 | #6831 | Phone Number Password Reset Doesn't Create Credential Account |
| 26 | #2317 | Phone verification providers which don't allow OTP customization |
| 23 | #3848 | Add rateLimit Configuration Option to emailOTP Plugin |
| 22 | #3494 | Verification Mail Sent on Login Attempt w/ sendOnSignIn: false |
| 20 | #6943 | Align Phone Number Plugin API with Email OTP Plugin |
| 20 | #5139 | Add requireNameForSignUp option to Magic Link plugin |
| 20 | #5596 | Add callbackUrl options to Email OTP |
| 17 | #4284 | Allow overriding magic-link expiration |
| 16 | #4274 | Add device binding option to magic link (phishing resistant) |

---

## Admin Plugin & RBAC
Admin features, roles, permissions, user management.

| Score | Issue | Title |
|-------|-------|-------|
| 102 | #2167 | Admin and Organization plugins Attribute Based Access Control |
| 62 | #4557 | Dynamic Roles and Permissions for Admin Plugin |
| 38 | #5200 | Send Invitation with admin plugin |
| 35 | #3717 | Too much server-side APIs requires session in admin plugin |
| 30 | #5830 | Local Admin Dashboard (like Drizzle Studio) |
| 29 | #7312 | ListUsers endpoint returns incorrect role |
| 26 | #3011 | hasPermission fails when called with multiple permissions |
| 25 | #3270 | Admin plugin: allow to override built-in access control |
| 24 | #7383 | [Feature Request]: Official Admin Dashboard for User Management |
| 23 | #5047 | Admin (server & client) plugin type error |
| 21 | #7333 | Allow authenticated users to set permissions when creating API keys |
| 21 | #5772 | Using custom IDP claims to assign roles |
| 21 | #3056 | Admin impersonate should be possible within organization roles |
| 16 | #6318 | Admin plugin getUser endpoint does not return typed additional fields |
| 15 | #6625 | Implement hasRole endpoint in admin plugin |
| 15 | #6081 | hasPermission silently returns false when role doesn't exist |

---

## API Keys
API key management, rate limiting, scoping.

| Score | Issue | Title |
|-------|-------|-------|
| 194 | #2446 | API Key owned by Organization |
| 45 | #4746 | Support Tenant/Org-Scoped API Keys in Multi-Tenant Applications |
| 21 | #7333 | Allow authenticated users to set permissions when creating API keys |
| 18 | #6035 | API Key rate limiting not behaving as expected |
| 16 | #2134 | API Keys > Permissions to manage users' keys |

---

## TypeScript & Type Inference
Type issues, inference problems, DX improvements.

| Score | Issue | Title |
|-------|-------|-------|
| 84 | #5666 | Systemic type issues across better-* packages ("cannot be named") |
| 34 | #2410 | additionalFields not supported in databaseHooks |
| 31 | #7440 | additionalFields with string[] type returns stringified array |
| 30 | #5291 | additional field is not working |
| 26 | #5218 | Inferred type missing after using username plugin |
| 19 | #7452 | listUsers() doesn't include additional fields in returned users type |
| 17 | #5149 | additionalFields should support custom TypeScript types |
| 16 | #7039 | TypeScript inference fails with organizationClient when additionalFields used |
| 13 | #5900 | TypeScript error when adding additionalFields to user with json type |
| 12 | #5637 | Typescript error in auth export |
| 6 | #5680 | setting an additional field input: false doesn't allow it in the create fn |

---

## Configuration & baseURL
Base URL configuration, dynamic settings.

| Score | Issue | Title |
|-------|-------|-------|
| 110 | #4151 | Dynamic setting of baseURL based on current request |
| 52 | #1119 | Insufficient documentation about baseUrl/BETTER_AUTH_URL |
| 42 | #7149 | baseURL validation breaks electron custom protocols |
| 25 | #7156 | Cookie "Secure" flag bypassed when baseURL is not configured |
| 20 | #6079 | authenticating to website that connects to remote better-auth service |
| 11 | #6406 | Feat: fallback NEXT_PUBLIC_AUTH_URL from VERCEL_URL |

---

## SSO / SAML / OIDC Provider
Enterprise SSO, SAML, acting as OIDC provider.

| Score | Issue | Title |
|-------|-------|-------|
| 32 | #7355 | OAuth/OIDC token endpoints return wrapped JSON instead of spec-compliant |
| 31 | #7052 | SSO SAML acsEndpoint uses case-sensitive email lookup |
| 27 | #7324 | SSO: Support multiple domains per provider |
| 22 | #5935 | Support for client assertions (private_key_jwt) |
| 18 | #7453 | oauth-provider: well-known endpoints should be mountable at origin root |
| 16 | #7184 | OAuth-Provider: CIMD |
| 16 | #6649 | OIDC Provider: Trusted Clients Token Endpoint Fails |
| 14 | #6254 | Feature Request: Enable Better Auth to Act as a SAML IdP |
| 12 | #6588 | SSO Provider should be more flexible when organizationId is provided |

---

## Stripe & Payments
Stripe integration, subscriptions, webhooks.

| Score | Issue | Title |
|-------|-------|-------|
| 48 | #6075 | Make Stripe Plugin More Generic to Support Connect and Other Use Cases |
| 32 | #3999 | Add Razorpay Payment Integration |
| 31 | #4565 | Stripe webhook couldn't handle checkout session "payment" mode |
| 28 | #5976 | Stripe webhook fails with "subscription_exposed_id must be a string" |
| 24 | #4004 | Stripe plugin lacks Connect webhooks integration functionality |
| 14 | #6522 | [STRIPE] Allow multiple concurrent active subscriptions |
| 16 | #4282 | stripe plugin: credit/usage based billing |

---

## Feature Requests (New Plugins/Providers)
New sign-in methods, audit logging, service accounts.

| Score | Issue | Title |
|-------|-------|-------|
| 136 | #3224 | [Feat req] Service Accounts |
| 108 | #1184 | Feat: Audit Logging Plugin |
| 103 | #5609 | Expose test utils for easy integration / E2E tests |
| 63 | #3495 | Sign in with Solana (SIWS) |
| 60 | #2324 | Support for Forcing Password Change on next login |
| 43 | #3526 | Sign in with Telegram Login Widget |
| 30 | #3229 | Proposal: Add Feature Flag Support via Token Claims [Plugin] |
| 29 | #4301 | Add a "lastLoginAt" field to users |
| 27 | #6738 | SIWX |
| 24 | #2043 | Self-Sovereign Identity (e.g. W3C VCs and DIDs) |
| 23 | #5150 | Support for Biscuit Token |
| 22 | #4089 | Feature Request: Anonymous User Per IP |
| 18 | #5305 | Feature request: phoneNumber masked |

---

## Documentation
Docs improvements, examples, onboarding.

| Score | Issue | Title |
|-------|-------|-------|
| 52 | #1119 | Insufficient documentation about baseUrl/BETTER_AUTH_URL |
| 22 | #6187 | docs: middleware examples in Next.js integration docs is misleading |
| 20 | #1708 | Explain how BetterAuth is architected |
| 18 | #5090 | Improve contributor onboarding: add architecture and plugin authoring docs |
| 17 | #7408 | addition of defaultTeam.name, documentation |
| 17 | #7107 | Docs: Add minimal server-side session retrieval example |
| 11 | #6539 | Suggestion About "Setup Invitation Email" Docs |
| 11 | #6396 | Clarify in the docs for phone number plugin that User must have password |

---

## Username Plugin
Username-based auth, username changes.

| Score | Issue | Title |
|-------|-------|-------|
| 46 | #3397 | Add username plugin option to allow client to change username |
| 38 | #2402 | User should be able to sign up with username/email/mobile |
| 26 | #5218 | Inferred type missing after using username plugin |
| 19 | #6297 | Redirect Issue with CallbackURL in Username Plugin |
| 14 | #4712 | Allow username sign-in to work with email OTP |
| 12 | #6579 | Add hook usernameAvailabilityChecker to username plugin |

---

## Sign-Up Flow & User Creation
Name optional, required fields, user creation hooks.

| Score | Issue | Title |
|-------|-------|-------|
| 138 | #424 | Please make the name optional on the signUp |
| 72 | #1557 | Ability to set "name" and additionalFields when signing-up through authClient.signIn.social |
| 35 | #2272 | feat: allow extending account table |
| 32 | #3078 | Social sign ins bypasses required fields in user |
| 30 | #7260 | databaseHooks.user.create.after causes foreign key constraint violation |
| 12 | #5968 | Creating a user with email/phone and without a password |
