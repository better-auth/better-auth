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
Core organization features, teams, roles, invitations, members.

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
| 29 | #4810 | authClient: organization.checkSlug() causes useActiveOrganization() isPending |
| 28 | #6716 | Allow unverified users to accept invitations |
| 28 | #6662 | Make the "slug" parameter optional |
| 28 | #6054 | listUserTeams causes error if user is not part of any teams |
| 28 | #6038 | Security: get-full-organization exposes full member list |
| 28 | #6832 | Migration fails: team table created before organization table |
| 27 | #1247 | Organization in user object |
| 26 | #1849 | Is a slug field planned for Teams? |
| 21 | #3556 | Incorrect FK reference for the teamMember table |
| 20 | #6768 | Prisma Invalid Invocation for Member Creation |
| 19 | #6772 | Add ability to entirely remove default role |
| 18 | #4708 | Organization set-active endpoint is missing session context |
| 18 | #7012 | allow passing userId for listUserTeams API |
| 18 | #5678 | organization team update (renaming) does not work |
| 16 | #6773 | Add support for organizationSlug in hasPermission API |
| 15 | #6723 | Include organization role in a user's organizations list |
| 14 | #5500 | 100% stateless backend support for the organization plugin |
| 13 | #6753 | Add bulk user inviting to an organization |
| 13 | #6598 | beforeCreateInvitation hook receives session.user as inviter |
| 11 | #6539 | Suggestion About "Setup Invitation Email" Docs |
| 9 | #5435 | Before/After hooks for leaveOrganization |
| 7 | #5728 | Add lastUsed field to Organization schema |

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
Cookies, getSession, session refresh, multi-session, secondary storage.

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
| 28 | #7124 | bug: KV ttl error |
| 27 | #6993 | Session ID missing in KV storage when using secondaryStorage |
| 27 | #6810 | Expo: Fail in useSession due to invalid SecureStore cookie |
| 25 | #4188 | auth.api.getSession returns null in Next.js server components |
| 22 | #7394 | Stateless session and refresh token |
| 21 | #6799 | Session refresh writes on GET request |
| 19 | #6289 | The session config not work as expected |
| 18 | #4475 | getSession or useSession not extending expiresAt |
| 17 | #6435 | Inconsistent cookie name construction logic between session_data and session_token |
| 16 | #5452 | secondaryStorage always gets default TTL |
| 16 | #6335 | Error 500 when on parallel requests that execute get-session |
| 16 | #6777 | Need for a refresh user sessions utility |
| 14 | #4059 | Add tab scoped multi-session support |
| 10 | #6224 | Bulk revocation of user sessions |
| 8 | #5447 | Finding a way to set the session cookie manually |
| 6 | #1314 | Make secondary-storage also compatible with ttl cache |

---

## Two-Factor Authentication & Passkeys
2FA, TOTP, passkeys, biometrics, WebAuthn.

| Score | Issue | Title |
|-------|-------|-------|
| 85 | #1279 | Allow 2FA activation/deactivation for social login users without password |
| 58 | #4396 | Allow registering passkeys without passwords |
| 40 | #5312 | Add option to enable 2fa by default for any new user |
| 29 | #7463 | [@better-auth/passkeys] TypeError: Reflect.getMetadata is not a function |
| 28 | #6762 | add passkey not working when generateId is set to 'serial' |
| 20 | #7259 | Add hooks for passkey creation, deletion, and updating |
| 19 | #4704 | Biometric Face ID login with Expo |
| 18 | #5310 | Add callback for two-factor/verify-otp |
| 17 | #5326 | Add twoFactorPage option to twoFactorClient plugin |
| 17 | #6077 | Two factor session cookies not working as intended in Next.js |
| 17 | #4114 | SIWE + 2FA doesn't works because password is required |
| 17 | #6192 | Delete verification challenge after use (passkey) |
| 17 | #7151 | Passkey plugin: WebAuthn extensions passthrough + pre-auth registration hooks |
| 16 | #4101 | The twoFactorRedirect does not specify TOTP or OTP |
| 14 | #6165 | Support Passkey Sign-In Using Email (Account Hinting) |
| 13 | #1676 | Passkey as 2FA |
| 12 | #6000 | Support PIN-based Step-up Authentication for Sensitive Actions |
| 8 | #5738 | Two Factor authentication should support enabling only for the OTP method |

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
| 18 | #7458 | Add support for the button mode API of FedCM in One tap plugin |
| 17 | #6973 | [Signin with Apple] New requirement to provide server-to-server notification endpoint |
| 17 | #5441 | Pass IDP name to Cognito to allow user to skip Cognito IDP selection screen |
| 16 | #6022 | lastLoginMethod not set when logging in with SIWE method |
| 15 | #7021 | Authentication deeplink flow for the macOS desktop application |
| 15 | #3278 | genericOAuth - authorizationUrl is not auto discovered when providing discoveryUrl |
| 15 | #6554 | Withings social provider |
| 14 | #5480 | mapProfileToUser updates the db only once |
| 12 | #4699 | Allow to retrieve clientSecret from an async function |
| 8 | #5457 | Cannot transfer previously linked OAuth account to current user |
| 8 | #5648 | account linking losts current session |
| 7 | #1214 | verifyIdToken with ctx arg |

---

## Database Adapters
Drizzle, Prisma, Kysely, MongoDB, TypeORM support.

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
| 18 | #5387 | MongoDB adapter customIdGenerator overrides user's generateId config |
| 17 | #7139 | Feat(cli): Support Prisma v7 multi-file schema |
| 12 | #5454 | MongoDB Adapter: List all sortable fields to index |
| 11 | #6515 | Support for creating multiple entries with adapter |

---

## Framework Integration
Next.js, SvelteKit, Expo, TanStack Start, NestJS, Qwik, Vue, Nuxt, Hono.

| Score | Issue | Title |
|-------|-------|-------|
| 74 | #3082 | Issue with set-auth-token acquisition not working on OnSuccess behavior |
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
| 18 | #5696 | Better Auth callback redirects to server (Hono 8787) port instead of client |
| 17 | #6909 | NestJS and Expo: inferred type of 'auth' cannot be named |
| 17 | #5868 | EXPO plugin SignOut does not remove the Session |
| 17 | #5358 | useSession(useFetch) in Nuxt SSR is causing: "Hydration completed but contains mismatches" |
| 17 | #4811 | payload CMS user sync |
| 12 | #5584 | We can't use getServerSession from Better Auth in Next.js 16 when using use cache |
| 12 | #5658 | Next.js 16 "please_restart_the_process" OAuth error |
| 8 | #5930 | Bearer set-auth-token is actually a decoded uri component of session token |

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
| 27 | #6729 | Better auth signin email logs in the wrong account |
| 26 | #6831 | Phone Number Password Reset Doesn't Create Credential Account |
| 26 | #2317 | Phone verification providers which don't allow OTP customization |
| 23 | #3848 | Add rateLimit Configuration Option to emailOTP Plugin |
| 22 | #3494 | Verification Mail Sent on Login Attempt w/ sendOnSignIn: false |
| 20 | #6943 | Align Phone Number Plugin API with Email OTP Plugin |
| 20 | #5139 | Add requireNameForSignUp option to Magic Link plugin |
| 20 | #5596 | Add callbackUrl options to Email OTP |
| 18 | #3761 | The sendVerificationOTP doesn't provide the user object |
| 17 | #4284 | Allow overriding magic-link expiration |
| 16 | #4274 | Add device binding option to magic link (phishing resistant) |
| 13 | #5635 | Multiple verified phone numbers |
| 11 | #6396 | Clarify in the docs for phone number plugin that User must have password |
| 9 | #6070 | Support custom OTP verification via object with verify() method |
| 8 | #5876 | Magic link error flow with no errorCallbackURL |
| 8 | #5483 | MagicLink Verify ReferenceError |
| 8 | #5475 | Verification email with link & otp |

---

## Admin Plugin & RBAC
Admin features, roles, permissions, user management, impersonation.

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
| 18 | #5990 | Admin list users — multi-field search support |
| 16 | #6318 | Admin plugin getUser endpoint does not return typed additional fields |
| 15 | #6625 | Implement hasRole endpoint in admin plugin |
| 15 | #6081 | hasPermission silently returns false when role doesn't exist |
| 10 | #6008 | cannot see impersonate user method on api |
| 5 | #5444 | onImpersonationStart / onImpersonationStop configuration hooks |

---

## API Keys
API key management, rate limiting, scoping, permissions.

| Score | Issue | Title |
|-------|-------|-------|
| 194 | #2446 | API Key owned by Organization |
| 45 | #4746 | Support Tenant/Org-Scoped API Keys in Multi-Tenant Applications |
| 21 | #7333 | Allow authenticated users to set permissions when creating API keys |
| 18 | #6035 | API Key rate limiting not behaving as expected |
| 17 | #4797 | Apikey without user |
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
| 18 | #7261 | $Infer.Session type doesn't include additionalFields when using dynamic trustedOrigins |
| 18 | #7411 | Default types augmentation |
| 17 | #5149 | additionalFields should support custom TypeScript types |
| 16 | #7039 | TypeScript inference fails with organizationClient when additionalFields used |
| 13 | #5900 | TypeScript error when adding additionalFields to user with json type |
| 12 | #5854 | Allow zod schema for inferAdditionalFields |
| 12 | #5637 | Typescript error in auth export |
| 10 | #6206 | Type error.body.code as string literal enum |
| 6 | #5680 | setting an additional field input: false doesn't allow referencing it |

---

## Configuration & baseURL
Base URL configuration, dynamic settings, environment variables.

| Score | Issue | Title |
|-------|-------|-------|
| 110 | #4151 | Dynamic setting of baseURL based on current request |
| 52 | #1119 | Insufficient documentation about baseUrl/BETTER_AUTH_URL |
| 42 | #7149 | baseURL validation breaks electron custom protocols |
| 25 | #7156 | Cookie "Secure" flag bypassed when baseURL is not configured |
| 24 | #6373 | path alias in tsconfig doesn't work |
| 20 | #6079 | authenticating to website that connects to remote better-auth service |
| 18 | #7406 | What is the correct way to access what domain is requesting my server |
| 11 | #6406 | Feat: fallback NEXT_PUBLIC_AUTH_URL from VERCEL_URL |
| 15 | #5474 | Support for Configuration Using Callbacks |

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
| 15 | #5782 | MCP: Custom OIDC configuration is not reflected in oauth-authorization-server endpoint |
| 14 | #6254 | Feature Request: Enable Better Auth to Act as a SAML IdP |
| 12 | #6610 | SSO SAML SingleLogoutService Not Implemented |
| 12 | #6588 | SSO Provider should be more flexible when organizationId is provided |
| 14 | #6291 | SSO: List Providers |
| 10 | #6350 | Device Authorization endpoints don't accept RFC 8628 compliant requests |

---

## Stripe & Payments
Stripe integration, subscriptions, webhooks, other payment providers.

| Score | Issue | Title |
|-------|-------|-------|
| 48 | #6075 | Make Stripe Plugin More Generic to Support Connect and Other Use Cases |
| 32 | #3999 | Add Razorpay Payment Integration |
| 31 | #4565 | Stripe webhook couldn't handle checkout session "payment" mode |
| 28 | #5976 | Stripe webhook fails with "subscription_exposed_id must be a string" |
| 24 | #4004 | Stripe plugin lacks Connect webhooks integration functionality |
| 16 | #4282 | stripe plugin: credit/usage based billing |
| 15 | #5664 | Paystack plugin |
| 14 | #6522 | [STRIPE] Allow multiple concurrent active subscriptions |
| 9 | #2609 | [Stripe] getCheckoutSessionParams is missing if user is subscribing annually |

---

## Feature Requests (New Plugins/Providers)
New sign-in methods, audit logging, service accounts, new features.

| Score | Issue | Title |
|-------|-------|-------|
| 136 | #3224 | [Feat req] Service Accounts |
| 108 | #1184 | Feat: Audit Logging Plugin |
| 103 | #5609 | Expose test utils for easy integration / E2E tests |
| 63 | #3495 | Sign in with Solana (SIWS) |
| 43 | #3526 | Sign in with Telegram Login Widget |
| 30 | #3229 | Proposal: Add Feature Flag Support via Token Claims [Plugin] |
| 29 | #4301 | Add a "lastLoginAt" field to users |
| 27 | #6738 | SIWX |
| 24 | #2043 | Self-Sovereign Identity (e.g. W3C VCs and DIDs) |
| 23 | #5150 | Support for Biscuit Token |
| 23 | #5907 | FEAT: Privy |
| 22 | #4089 | Feature Request: Anonymous User Per IP |
| 18 | #5305 | Feature request: phoneNumber masked |
| 14 | #6875 | Kerberos Support |
| 12 | #5595 | Request for Webpush plugin in Better-auth |
| 8 | #5727 | Make 'Last Login Method' GDPR compliant |

---

## Documentation
Docs improvements, examples, onboarding.

| Score | Issue | Title |
|-------|-------|-------|
| 52 | #1119 | Insufficient documentation about baseUrl/BETTER_AUTH_URL |
| 22 | #6187 | docs: middleware examples in Next.js integration docs is misleading |
| 20 | #1708 | Explain how BetterAuth is architected |
| 18 | #5090 | Improve contributor onboarding: add architecture and plugin authoring docs |
| 18 | #7107 | Docs: Add minimal server-side session retrieval example |
| 17 | #7408 | addition of defaultTeam.name, documentation |
| 16 | #6204 | Document form-based auth to support progressive enhancement |
| 11 | #6539 | Suggestion About "Setup Invitation Email" Docs |
| 11 | #6396 | Clarify in the docs for phone number plugin that User must have password |
| 10 | #6059 | Clarify field renaming |

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
Name optional, required fields, user creation hooks, account extension.

| Score | Issue | Title |
|-------|-------|-------|
| 138 | #424 | Please make the name optional on the signUp |
| 72 | #1557 | Ability to set "name" and additionalFields when signing-up through authClient.signIn.social |
| 35 | #2272 | feat: allow extending account table |
| 32 | #3078 | Social sign ins bypasses required fields in user |
| 30 | #7260 | databaseHooks.user.create.after causes foreign key constraint violation |
| 16 | #6553 | Cannot pass custom fields defined in additionalFields to auth.api.signUpEmail() |
| 15 | #6593 | Missing user's additional fields in database hooks and email verification |
| 14 | #5879 | user cannot login after create with createUser as admin |
| 12 | #5968 | Creating a user with email/phone and without a password |

---

## Password & Credential Management
Password reset, password change, hashing, credential flows.

| Score | Issue | Title |
|-------|-------|-------|
| 60 | #2324 | Support for Forcing Password Change on next login |
| 22 | #6608 | Use argon2id by default for password hashing when supported |
| 14 | #6414 | Semantic Inconsistency in emailVerified Field and Password Reset Behavior |
| 14 | #6130 | Automatically sign in after reset password |
| 14 | #6001 | How to Configure Auth for System-Generated Credentials |
| 14 | #6247 | Support Async customPasswordCompromisedMessage for haveIBeenPwned Plugin |

---

## CLI & Schema Generation
CLI commands, migrations, schema generation.

| Score | Issue | Title |
|-------|-------|-------|
| 59 | #2017 | Generate Kysely migration as typescript |
| 35 | #7033 | BetterAuth CLI cannot read Prisma client in NestJS project |
| 30 | #1162 | How to generate real/decimal in the schema from a plugin |
| 27 | #6606 | CLI generate command: Support for PostgreSQL custom schema |
| 26 | #7275 | CLI Incorrectly Stringifies JSON Type Defaults in Drizzle |
| 23 | #5807 | Map custom id field names |
| 21 | #6668 | Code generation failure |
| 17 | #7139 | Feat(cli): Support Prisma v7 multi-file schema |
| 17 | #7297 | [FEATURE] Don't clash with Postgres keyword User |
| 14 | #6262 | Add option to rename relations |
| 8 | #3980 | Force SQL file generation |

---

## Error Handling & Logging
Error responses, logging, debugging.

| Score | Issue | Title |
|-------|-------|-------|
| 68 | #1259 | Request: Better logging on generic OAuth flow |
| 27 | #7035 | Better Auth returns HTTP 200 for error responses instead of proper status codes |
| 26 | #5541 | Return to Application redirect issue |
| 22 | #5467 | Oauth Error callback URL discrepancies |
| 18 | #3875 | Do not unconditionally inject ?error into error redirect URL |
| 16 | #6228 | ERROR [Better Auth]: Error Error: getaddrinfo ENOTFOUND localhost |
| 16 | #2950 | Allow disabling expected errors |
| 15 | #3269 | Raise APIError messages with codes, not just string messages |
| 15 | #7037 | Environment Variable for Logger Level |
| 7 | #4566 | Support callback in onAPIError's errorURL |

---

## JWT & Token Management
JWT configuration, JWKS, token templates.

| Score | Issue | Title |
|-------|-------|-------|
| 30 | #7141 | OAuth Proxy: Failed query: delete from "verification" |
| 18 | #7245 | Allow HS256 JWTs |
| 12 | #5554 | JWT plugin: Support token "templates" (client-selected) |
| 10 | #5663 | Prevent duplicate JWKs caused by race conditions during creation |
| 9 | #3954 | jwks table is queried from the database on every session read |

---

## Hooks & Middleware
Database hooks, middleware, callbacks.

| Score | Issue | Title |
|-------|-------|-------|
| 34 | #2410 | additionalFields not supported in databaseHooks |
| 30 | #7260 | databaseHooks.user.create.after causes foreign key constraint violation |
| 18 | #6497 | After hook is not called when route handler throws redirect |
| 15 | #6593 | Missing user's additional fields in database hooks |
| 14 | #7002 | onUserVerified hook or afterEmailVerification improvement |
| 12 | #5507 | Post-auth verification requirements / multi-step setup |
| 9 | #5435 | Before/After hooks for leaveOrganization |
| 5 | #5444 | onImpersonationStart / onImpersonationStop configuration hooks |

---

## OpenAPI & API Design
OpenAPI schema, API responses, spec compliance.

| Score | Issue | Title |
|-------|-------|-------|
| 32 | #7355 | OAuth/OIDC token endpoints return wrapped JSON instead of spec-compliant |
| 28 | #1493 | OpenAPI Schema should include 'summary' field |
| 23 | #6940 | Support sessionId parameter in revoke-session endpoint |
| 12 | #6446 | better auth open api user and session component both have id as not required |
| 10 | #6350 | Device Authorization endpoints don't accept RFC 8628 compliant requests |

---

## Rate Limiting
Rate limit configuration, behavior.

| Score | Issue | Title |
|-------|-------|-------|
| 23 | #3848 | Add rateLimit Configuration Option to emailOTP Plugin |
| 18 | #6035 | API Key rate limiting not behaving as expected |
| 17 | #7264 | feat: Allow rate limiting based on success/failure responses |
| 9 | #6036 | Rate-limit retry metadata documented as seconds, but API returns milliseconds |

---

## Client Bundle & Performance
Bundle size, performance, caching.

| Score | Issue | Title |
|-------|-------|-------|
| 17 | #6213 | Client bundle size increase 4.5kb from 1.3.34 to 1.4.0 |
| 14 | #3668 | Dependency Dashboard |
| 27 | #6564 | Dev dependency expo-network is set to optional, but imported on expo package |

---

## Miscellaneous / Uncategorized
Issues that don't fit neatly into other categories.

| Score | Issue | Title |
|-------|-------|-------|
| 31 | #5409 | List users query with plus sign fails |
| 32 | #7155 | Error when updating an array field |
| 18 | #6391 | Overriding the default value of account.modelName in the config |
| 18 | #4257 | Guidance Needed: Authenticating Server-to-Server Admin API Calls |
| 17 | #7283 | Multi-domain (non-subdomain) authentication: cookies not set |
| 17 | #7222 | Offer helper functions to manually validate cookies |
| 15 | #6260 | Error: Malformed ObjectID generated by Better Auth during user creation |
| 15 | #5030 | signIn action callbackURL parameter doesn't work like signUp |
| 19 | #7465 | Is it possible to use functions such as "authorize" in next-auth |
| 19 | #7435 | Assignment to undeclared variable _process_env_key |
| 12 | #6159 | Server-side createInvitation requires session token |
