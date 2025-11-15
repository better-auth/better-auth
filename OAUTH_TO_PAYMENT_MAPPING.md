# OAuth to Payment Gateway Mapping

This document shows how OAuth concepts in better-auth map to Payment Gateway concepts in your library.

## 🔄 Core Concept Mapping

| OAuth Concept (better-auth) | Payment Concept (your library) | Why It's Similar |
|----------------------------|--------------------------------|------------------|
| **OAuth Provider** (Google, GitHub) | **Payment Gateway** (Stripe, Flutterwave) | Both are external services with different APIs |
| **Authorization URL** | **Payment Intent / Checkout URL** | Both redirect user to external service |
| **OAuth Callback** | **Payment Webhook** | Both receive confirmation from external service |
| **Access Token** | **Payment ID / Transaction ID** | Both are identifiers for the session/transaction |
| **User Profile** | **Payment Details** | Both are data returned from the service |
| **Refresh Token** | **Subscription Renewal** | Both handle recurring/long-term access |

---

## 📋 Interface Comparison

### Better-Auth: OAuthProvider Interface

```typescript
export interface OAuthProvider {
    id: string;                    // "google", "github"
    name: string;                  // "Google", "GitHub"

    // Start the OAuth flow
    createAuthorizationURL: (data: {
        state: string;
        codeVerifier: string;
        scopes?: string[];
        redirectURI: string;
    }) => Promise<URL>;

    // Verify the callback
    validateAuthorizationCode: (data: {
        code: string;
        redirectURI: string;
    }) => Promise<OAuth2Tokens>;

    // Get user data
    getUserInfo: (token: OAuth2Tokens) => Promise<{
        user: OAuth2UserInfo;
        data: T;
    }>;

    // Optional: refresh access
    refreshAccessToken?: (refreshToken: string) => Promise<OAuth2Tokens>;
}
```

### Your Library: PaymentProvider Interface

```typescript
export interface PaymentProvider {
    id: string;                    // "stripe", "flutterwave"
    name: string;                  // "Stripe", "Flutterwave"

    // Start the payment flow
    createPaymentIntent: (data: {
        amount: number;
        currency: string;
        customerId?: string;
        metadata?: Record<string, any>;
    }) => Promise<PaymentIntent>;

    // Verify the payment
    verifyPayment: (paymentId: string) => Promise<PaymentStatus>;

    // Handle provider callback
    handleWebhook: (payload: unknown, signature: string) => Promise<WebhookEvent>;

    // Optional: handle refunds
    refundPayment?: (paymentId: string, amount?: number) => Promise<Refund>;
}
```

**See the parallel?** Both follow the same pattern:
1. **Initiate** (create URL / create intent)
2. **Verify** (validate code / verify payment)
3. **Get Data** (get user info / handle webhook)
4. **Optional Features** (refresh token / refund)

---

## 🔄 Flow Comparison

### OAuth Flow (better-auth)

```
1. User clicks "Login with Google"
   ↓
2. createAuthorizationURL() generates redirect URL
   ↓
3. User redirects to Google
   ↓
4. User approves on Google's site
   ↓
5. Google redirects back with code
   ↓
6. validateAuthorizationCode() exchanges code for tokens
   ↓
7. getUserInfo() fetches user profile
   ↓
8. User is logged in
```

### Payment Flow (your library)

```
1. User clicks "Pay with Stripe"
   ↓
2. createPaymentIntent() generates checkout session
   ↓
3. User redirects to Stripe checkout
   ↓
4. User pays on Stripe's site
   ↓
5. Stripe sends webhook to your server
   ↓
6. handleWebhook() verifies webhook signature
   ↓
7. verifyPayment() confirms payment status
   ↓
8. Payment is complete
```

**Same flow, different domain!**

---

## 📦 Provider Implementation Comparison

### Better-Auth: Google Provider

```typescript
export const google = (options: GoogleOptions) => {
    return {
        id: "google",
        name: "Google",

        async createAuthorizationURL({ state, scopes, redirectURI }) {
            const url = new URL("https://accounts.google.com/o/oauth2/auth");
            url.searchParams.set("client_id", options.clientId);
            url.searchParams.set("redirect_uri", redirectURI);
            url.searchParams.set("scope", scopes.join(" "));
            url.searchParams.set("state", state);
            return url;
        },

        async validateAuthorizationCode({ code, redirectURI }) {
            const response = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                body: new URLSearchParams({
                    code,
                    client_id: options.clientId,
                    client_secret: options.clientSecret,
                    redirect_uri: redirectURI,
                    grant_type: "authorization_code",
                }),
            });
            return await response.json();
        },

        async getUserInfo(token) {
            const user = decodeJwt(token.idToken);
            return {
                user: {
                    id: user.sub,
                    email: user.email,
                    name: user.name,
                },
                data: user,
            };
        },
    };
};
```

### Your Library: Stripe Provider

```typescript
export const stripe = (options: StripeOptions) => {
    const stripeClient = new Stripe(options.apiKey);

    return {
        id: "stripe",
        name: "Stripe",

        async createPaymentIntent({ amount, currency, customerId, metadata }) {
            const paymentIntent = await stripeClient.paymentIntents.create({
                amount,
                currency,
                customer: customerId,
                metadata,
            });

            return {
                id: paymentIntent.id,
                clientSecret: paymentIntent.client_secret,
                amount: paymentIntent.amount,
                status: paymentIntent.status,
            };
        },

        async verifyPayment(paymentId) {
            const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentId);

            return {
                id: paymentIntent.id,
                status: paymentIntent.status,
                paid: paymentIntent.status === "succeeded",
                amount: paymentIntent.amount,
            };
        },

        async handleWebhook(payload, signature) {
            const event = stripeClient.webhooks.constructEvent(
                payload,
                signature,
                options.webhookSecret
            );

            return {
                type: event.type,
                data: event.data.object,
            };
        },
    };
};
```

**Notice:** Same structure, different API calls!

---

## 🔌 Plugin Comparison

### Better-Auth: Stripe Plugin (for subscriptions)

```typescript
export const stripe = (options: StripeOptions) => {
    return {
        id: "stripe",

        schema: {
            subscription: {
                fields: {
                    stripeSubscriptionId: { type: "string" },
                    stripeCustomerId: { type: "string" },
                    plan: { type: "string" },
                    status: { type: "string" },
                },
            },
        },

        endpoints: {
            "subscription/subscribe": createAuthEndpoint(...),
            "subscription/cancel": createAuthEndpoint(...),
        },
    };
};
```

### Your Library: Subscription Plugin

```typescript
export const subscriptions = (options: SubscriptionOptions) => {
    return {
        id: "subscriptions",

        schema: {
            subscription: {
                fields: {
                    paymentProviderId: { type: "string" },
                    subscriptionId: { type: "string" },
                    plan: { type: "string" },
                    status: { type: "string" },
                    currentPeriodEnd: { type: "date" },
                },
            },
        },

        endpoints: {
            "subscription/create": createPaymentEndpoint(...),
            "subscription/cancel": createPaymentEndpoint(...),
            "subscription/upgrade": createPaymentEndpoint(...),
        },
    };
};
```

**Same plugin architecture!**

---

## ⚙️ Configuration Comparison

### Better-Auth Configuration

```typescript
const auth = betterAuth({
    // Configure multiple OAuth providers
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            scopes: ["email", "profile"],
        },
        github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
        },
    },

    // Add plugins
    plugins: [
        bearer(),
        organization(),
    ],
});
```

### Your Library Configuration

```typescript
const payments = betterPayments({
    // Configure multiple payment providers
    providers: {
        stripe: {
            apiKey: process.env.STRIPE_SECRET_KEY,
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        },
        flutterwave: {
            secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
            publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
        },
    },

    // Add plugins
    plugins: [
        subscriptions(),
        invoicing(),
    ],
});
```

**Identical configuration pattern!**

---

## 🎯 Usage Comparison

### Better-Auth Usage

```typescript
// Redirect to Google login
const url = await auth.api.signInSocial({
    provider: "google",
    callbackURL: "/auth/callback",
});

// Verify callback
const session = await auth.api.verifyCallback({
    code: request.query.code,
});

// Get user
const user = await auth.api.getSession({
    token: session.token,
});
```

### Your Library Usage

```typescript
// Create Stripe payment
const intent = await payments.payment.create("stripe", {
    amount: 5000,
    currency: "USD",
});

// Redirect user to intent.clientSecret or payment URL

// Verify webhook
const event = await payments.payment.handleWebhook("stripe", {
    payload: request.body,
    signature: request.headers["stripe-signature"],
});

// Get payment status
const status = await payments.payment.verify("stripe", event.paymentId);
```

**Same API design!**

---

## 🔑 Key Takeaways

| Better-Auth Does | Your Library Does | Same Pattern |
|------------------|-------------------|--------------|
| Abstracts OAuth providers | Abstracts payment gateways | ✅ Provider abstraction |
| Supports Google, GitHub, etc. | Supports Stripe, Flutterwave, etc. | ✅ Multiple providers |
| Plugins add features (SSO, passkey) | Plugins add features (subscriptions, invoicing) | ✅ Plugin system |
| Type-safe configuration | Type-safe configuration | ✅ TypeScript generics |
| Framework agnostic | Framework agnostic | ✅ Works anywhere |
| Monorepo structure | Monorepo structure | ✅ Package organization |

---

## 💡 Aha Moments

### 1. **Provider = Service Abstraction**
Better-auth abstracts OAuth providers (Google, GitHub)
→ You abstract payment providers (Stripe, Flutterwave)

### 2. **Same Flow, Different Domain**
OAuth: redirect → callback → get user
→ Payment: checkout → webhook → verify payment

### 3. **Plugins = Features**
Better-auth plugins: SSO, organizations, passkeys
→ Your plugins: subscriptions, invoicing, split payments

### 4. **Configuration = Developer Experience**
Better-auth makes OAuth simple
→ You make payments simple

---

## 📚 Study Strategy

When reading better-auth code, mentally replace:

- `OAuthProvider` → `PaymentProvider`
- `createAuthorizationURL` → `createPaymentIntent`
- `validateAuthorizationCode` → `verifyPayment`
- `getUserInfo` → `handleWebhook`
- `google()` → `stripe()`
- `github()` → `flutterwave()`

The patterns are **identical**, only the domain changes!

---

## 🎓 Next Steps

1. ✅ Read this mapping document
2. ✅ Study the files in LEARNING_GUIDE.md
3. ✅ Keep this mental mapping in mind
4. ✅ When you see OAuth code, think "How does this apply to payments?"
5. ✅ Start implementing your own providers

**You've got this!** 🚀
