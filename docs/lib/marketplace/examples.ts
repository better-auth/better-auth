import type { MarketplacePluginExample } from "./types";

/**
 * Short showcase snippets for docs plugins on marketplace detail pages.
 * Keep these high-signal — full APIs live in `/docs/plugins/*`.
 */
export const officialPluginExamples: Record<
	string,
	MarketplacePluginExample[]
> = {
	"2fa": [
		{
			title: "Enable 2FA & get TOTP URI",
			code: `const { data, error } = await authClient.twoFactor.enable({
  password: userPassword,
})

const { data: totp } = await authClient.twoFactor.getTotpUri({
  password: userPassword,
})
// totp.totpURI → show in a QR code`,
		},
		{
			title: "Verify TOTP / OTP",
			code: `await authClient.twoFactor.verifyTotp({ code: "123456" })

await authClient.twoFactor.sendOtp()
await authClient.twoFactor.verifyOtp({ code: "123456" })`,
		},
	],
	username: [
		{
			title: "Sign up / sign in with username",
			code: `await authClient.signUp.email({
  email: "user@example.com",
  password: "secure-password",
  name: "Alex",
  username: "alex",
})

await authClient.signIn.username({
  username: "alex",
  password: "secure-password",
})`,
		},
	],
	anonymous: [
		{
			title: "Start as a guest, then upgrade",
			code: `await authClient.signIn.anonymous()

// Later — link the anonymous session to a real account
await authClient.signIn.email({
  email: "user@example.com",
  password: "secure-password",
})`,
		},
	],
	"phone-number": [
		{
			title: "Send & verify SMS OTP",
			code: `await authClient.phoneNumber.sendOtp({
  phoneNumber: "+1234567890",
})

await authClient.phoneNumber.verify({
  phoneNumber: "+1234567890",
  code: "123456",
})`,
		},
	],
	"magic-link": [
		{
			title: "Request a magic link",
			code: `await authClient.signIn.magicLink({
  email: "user@example.com",
  callbackURL: "/dashboard",
})`,
		},
	],
	"email-otp": [
		{
			title: "Send & verify email OTP",
			code: `await authClient.emailOtp.sendVerificationOtp({
  email: "user@example.com",
  type: "sign-in",
})

await authClient.signIn.emailOtp({
  email: "user@example.com",
  otp: "123456",
})`,
		},
	],
	passkey: [
		{
			title: "Register & sign in with a passkey",
			code: `await authClient.passkey.addPasskey({
  name: "MacBook Touch ID",
})

await authClient.signIn.passkey()`,
		},
	],
	"generic-oauth": [
		{
			title: "Sign in with a custom OAuth provider",
			code: `await authClient.signIn.social({
  provider: "my-provider",
  callbackURL: "/dashboard",
})`,
		},
	],
	"one-tap": [
		{
			title: "Prompt Google One Tap",
			code: `await authClient.oneTap({
  callbackURL: "/dashboard",
})`,
		},
	],
	siwe: [
		{
			title: "Sign in with Ethereum",
			code: `const { data } = await authClient.siwe.nonce()

// Build an ERC-4361 message with data.nonce, then sign it
const { data: session } = await authClient.siwe.verify({
  message,
  signature,
})`,
		},
	],
	admin: [
		{
			title: "List users & ban",
			code: `const { data: users } = await authClient.admin.listUsers({
  limit: 20,
})

await authClient.admin.banUser({
  userId: "user_123",
  banReason: "Spam",
})`,
		},
		{
			title: "Impersonate a user",
			code: `await authClient.admin.impersonateUser({
  userId: "user_123",
})`,
		},
	],
	"api-key": [
		{
			title: "Create & verify an API key",
			code: `const { data } = await authClient.apiKey.create({
  name: "CI key",
  expiresIn: 60 * 60 * 24 * 30,
})

const result = await auth.api.verifyApiKey({
  body: { key: data.key },
})
// result.valid → true | false`,
		},
	],
	mcp: [
		{
			title: "MCP OAuth is handled by the plugin routes",
			code: `// Point MCP clients at your auth base URL.
// The plugin exposes discovery + token endpoints for agents.
const auth = betterAuth({
  plugins: [mcp({ loginPage: "/sign-in" })],
})`,
		},
	],
	organization: [
		{
			title: "Create org & invite a member",
			code: `await authClient.organization.create({
  name: "Acme Inc",
  slug: "acme",
})

await authClient.organization.inviteMember({
  email: "dev@acme.com",
  role: "member",
})`,
		},
		{
			title: "Check permissions",
			code: `const canInvite = await authClient.organization.hasPermission({
  permission: { invitation: ["create"] },
})`,
		},
	],
	"oauth-provider": [
		{
			title: "Register an OAuth client",
			code: `const client = await auth.api.createOAuthClient({
  body: {
    name: "Third-party App",
    redirect_uris: ["https://app.example.com/callback"],
  },
  headers: await headers(),
})`,
		},
	],
	sso: [
		{
			title: "Register a provider & sign in",
			code: `await authClient.sso.register({
  providerId: "okta",
  issuer: "https://example.okta.com",
  domain: "acme.com",
  oidcConfig: {
    clientId: process.env.OKTA_CLIENT_ID!,
    clientSecret: process.env.OKTA_CLIENT_SECRET!,
  },
})

await authClient.signIn.sso({
  email: "user@acme.com",
  callbackURL: "/dashboard",
})`,
		},
	],
	scim: [
		{
			title: "SCIM endpoints for IdP provisioning",
			code: `const auth = betterAuth({
  plugins: [
    scim({
      // IdPs call /api/auth/scim/v2/*
      provider: "okta",
    }),
  ],
})`,
		},
	],
	bearer: [
		{
			title: "Capture & send a bearer token",
			code: `await authClient.signIn.email(
  { email: "user@example.com", password: "secure-password" },
  {
    onSuccess(ctx) {
      const token = ctx.response.headers.get("set-auth-token")
      localStorage.setItem("bearer_token", token!)
    },
  },
)

// Or configure fetchOptions.auth.type = "Bearer" on the client`,
		},
	],
	"device-authorization": [
		{
			title: "Device code flow",
			code: `const { data } = await authClient.device.code({
  client_id: "cli-app",
})
// Show data.user_code + data.verification_uri to the user

const token = await authClient.device.token({
  client_id: "cli-app",
  device_code: data.device_code,
  grant_type: "urn:ietf:params:oauth:grant-type:device_code",
})`,
		},
	],
	captcha: [
		{
			title: "Pass captcha token with sign-in",
			code: `await authClient.signIn.email({
  email: "user@example.com",
  password: "secure-password",
  fetchOptions: {
    headers: { "x-captcha-response": captchaToken },
  },
})`,
		},
	],
	"have-i-been-pwned": [
		{
			title: "Breached passwords are rejected automatically",
			code: `// No client API — enable the plugin and weak/breached
// passwords fail on sign-up and password change.
const auth = betterAuth({
  plugins: [haveIBeenPwned()],
})`,
		},
	],
	"last-login-method": [
		{
			title: "Highlight the last used method",
			code: `const lastMethod = authClient.getLastUsedLoginMethod()
const wasGoogle = authClient.isLastUsedLoginMethod("google")`,
		},
	],
	"multi-session": [
		{
			title: "List & switch sessions",
			code: `const { data: sessions } = await authClient.multiSession.listDeviceSessions()

await authClient.multiSession.setActive({
  sessionToken: sessions[0].session.token,
})`,
		},
	],
	"oauth-proxy": [
		{
			title: "Social sign-in through the proxy",
			code: `// Configure currentURL / productionURL on the plugin,
// then sign in as usual — callbacks are proxied for you.
await authClient.signIn.social({
  provider: "github",
  callbackURL: "/dashboard",
})`,
		},
	],
	"one-time-token": [
		{
			title: "Generate & verify a one-time token",
			code: `const { token } = await authClient.oneTimeToken.generate()

await authClient.oneTimeToken.verify({ token })`,
		},
	],
	"open-api": [
		{
			title: "Generate the OpenAPI schema",
			code: `const schema = await auth.api.generateOpenAPISchema()
// Serve at /api/auth/reference when using the plugin defaults`,
		},
	],
	jwt: [
		{
			title: "Get a JWT for external services",
			code: `const { data } = await authClient.token()
// data.token → Authorization: Bearer <jwt>

const { data: keys } = await authClient.jwks()`,
		},
	],
	dub: [
		{
			title: "Lead tracking is automatic on OAuth",
			code: `// With the Dub plugin + cookie, OAuth sign-ups track leads.
await authClient.signIn.social({
  provider: "github",
  callbackURL: "/dashboard",
})`,
		},
	],
	stripe: [
		{
			title: "Upgrade to a plan",
			code: `await authClient.subscription.upgrade({
  plan: "pro",
  successUrl: "/dashboard",
  cancelUrl: "/pricing",
})`,
		},
		{
			title: "List subscriptions",
			code: `const { data: subscriptions } = await authClient.subscription.list()`,
		},
	],
	polar: [
		{
			title: "Checkout & customer portal",
			code: `await authClient.checkout({ products: ["prod_123"] })

await authClient.customer.portal()
const { data: state } = await authClient.customer.state()`,
		},
	],
	autumn: [
		{
			title: "Check entitlement & track usage",
			code: `const { allowed } = await auth.api.check({
  body: { featureId: "messages" },
  headers: await headers(),
})

await auth.api.track({
  body: { featureId: "messages", value: 1 },
  headers: await headers(),
})`,
		},
	],
	dodopayments: [
		{
			title: "Checkout & customer portal",
			code: `await authClient.dodopayments.checkoutSession({
  product_cart: [{ product_id: "pdt_123", quantity: 1 }],
  return_url: "/dashboard",
})

await authClient.dodopayments.customer.portal()`,
		},
	],
	creem: [
		{
			title: "Checkout & portal",
			code: `await authClient.creem.createCheckout({
  productId: "prod_123",
})

await authClient.creem.createPortal()`,
		},
	],
	chargebee: [
		{
			title: "Create subscription & open portal",
			code: `await authClient.subscription.create({
  planId: "pro-monthly",
})

await authClient.subscription.portal()
const { data } = await authClient.subscription.list()`,
		},
	],
	commet: [
		{
			title: "Portal, features & usage",
			code: `await authClient.customer.portal()

const { data: check } = await authClient.features.check("sso")
await authClient.usage.track({ featureCode: "api_calls", quantity: 1 })`,
		},
	],
	i18n: [
		{
			title: "Localized error messages",
			code: `const auth = betterAuth({
  plugins: [
    i18n({
      defaultLocale: "en",
      translations: {
        es: { USER_NOT_FOUND: "Usuario no encontrado" },
      },
    }),
  ],
})`,
		},
	],
	cimd: [
		{
			title: "Dynamic client discovery",
			code: `// Pair with oauthProvider — clients can discover
// your authorization server without pre-registration.
const auth = betterAuth({
  plugins: [oauthProvider(), cimd()],
})`,
		},
	],
	"test-utils": [
		{
			title: "Create a user & authenticated session",
			code: `const ctx = await auth.$context
const test = ctx.test

const user = await test.saveUser(test.createUser({
  email: "alice@example.com",
}))

const { headers } = await test.login({ userId: user.id })
const session = await auth.api.getSession({ headers })`,
		},
	],
	"agent-auth": [
		{
			title: "Resolve agent session",
			code: `const agentSession = await auth.api.getAgentSession({
  headers: await headers(),
})`,
		},
	],
};
