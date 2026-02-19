# @better-auth/stripe

Stripe integration for Better Auth with support for subscriptions, one-time payments, and **Stripe Connect** for revenue sharing.

## Installation

```bash
npm install @better-auth/stripe
```

## Quick Start

```typescript
import { betterAuth } from "better-auth";
import { stripe } from "@better-auth/stripe";

const auth = betterAuth({
  plugins: [
    stripe({
      stripe: new Stripe(process.env.STRIPE_SECRET_KEY!),
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      // Add Connect support
      connect: {
        stripeConnectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET!,
        onboardingReturnUrl: process.env.CONNECT_ONBOARDING_RETURN_URL!,
        onboardingRefreshUrl: process.env.CONNECT_ONBOARDING_REFRESH_URL!,
      },
    }),
  ],
});
```

## Stripe Connect (Revenue Sharing)

Stripe Connect allows you to build platforms that can collect payments on behalf of multiple partners and automatically split revenue.

### Features

- **Connect Account Onboarding**: Easy onboarding flow for connected accounts
- **Automatic Revenue Splitting**: Create payments that automatically transfer funds to connected accounts
- **Webhook Support**: Handle Connect-specific webhooks for account status, payouts, and disputes
- **Account Management**: Track account verification status and capabilities

### Connected Account Options

```typescript
stripe({
  // ... standard stripe config
  connect: {
    // Required: Webhook secret for Connect events (different from standard webhooks)
    stripeConnectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET!,

    // Required: URLs for Connect onboarding flow
    onboardingReturnUrl: "https://yourapp.com/connect/success",
    onboardingRefreshUrl: "https://yourapp.com/connect/onboarding",

    // Optional: Account type (standard, express, custom). Default: express
    connectAccountType: "express",

    // Optional: Requested capabilities
    capabilities: ["card_payments", "transfers"],

    // Optional: Restrict to specific countries
    supportedCountries: ["US", "CA", "GB"],

    // Optional: Default application fee percentage
    applicationFeePercent: 5,

    // Optional: Minimum charge amount (in cents)
    minimumChargeAmount: 100,

    // Event handlers
    onAccountUpdated: async ({ userId, stripeAccountId, status }) => {
      // Called when account status changes
      console.log(`Account ${stripeAccountId} status updated for user ${userId}`);
    },

    onPayoutPaid: async ({ userId, stripeAccountId, payout }) => {
      // Called when a payout completes
      console.log(`Payout of ${payout.amount} to account ${stripeAccountId}`);
    },

    onChargeback: async ({ userId, stripeAccountId, dispute }) => {
      // Called when a chargeback occurs
      console.log(`Dispute on account ${stripeAccountId}: ${dispute.reason}`);
    },
  },
});
```

### API Endpoints

#### Connect Account Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/connect/account` | Create a new Connect account for the authenticated user |
| GET | `/connect/account` | Get the current user's Connect account status |

#### Payments with Revenue Split

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/connect/payment` | Create a payment that splits revenue with a connected account |
| GET | `/connect/transactions` | List transactions for the current user's connected account |

### Client Usage

```typescript
// Start Connect onboarding
const response = await authClient.connect.createAccount({
  country: "US",
  businessType: "company",
});

// Redirect to Stripe Connect onboarding
window.location.href = response.data.onboardingUrl;

// Create a payment with revenue split
const payment = await authClient.connect.createPayment({
  connectedAccountId: "acct_xxx",
  amount: 5000, // $50.00
  currency: "usd",
  applicationFeePercent: 10, // 10% platform fee
});

// Use the client secret with Stripe.js
elements = stripe.elements({ clientSecret: payment.data.clientSecret });
```

### Webhook Setup

You need to configure **two separate webhooks** in Stripe:

1. **Standard webhooks** (for your platform):
   - Endpoint: `https://yourapp.com/api/auth/stripe/webhook`
   - Select events: `customer.subscription.created`, `invoice.payment_succeeded`, etc.

2. **Connect webhooks** (for connected accounts):
   - Endpoint: `https://yourapp.com/api/auth/stripe/connect/webhook`
   - Select events:
     - `account.updated`
     - `account.application.deauthorized`
     - `capability.updated`
     - `payment_intent.succeeded`
     - `payout.paid`
     - `charge.dispute.created`

### Connected Account Database Schema

When Connect is enabled, the following tables are added:

#### `connected_account`

| Field | Type | Description |
|-------|------|-------------|
| id | string | Primary key |
| userId | string | Reference to auth user |
| stripeAccountId | string | Stripe Connect account ID (acct_xxx) |
| status | string | pending, active, restricted, deauthorized |
| chargesEnabled | boolean | Can accept charges |
| payoutsEnabled | boolean | Can receive payouts |
| capabilities | json | Stripe capabilities object |
| country | string | Account country |
| businessType | string | individual or company |
| createdAt | date | Account creation time |

#### `connect_transaction`

| Field | Type | Description |
|-------|------|-------------|
| id | string | Primary key |
| stripePaymentIntentId | string | PaymentIntent ID |
| connectedAccountId | string | Destination account ID |
| amount | number | Payment amount (cents) |
| applicationFeeAmount | number | Platform fee (cents) |
| status | string | pending, completed, failed, refunded |

## Learn More

- [Stripe Connect Documentation](https://docs.stripe.com/connect)
- [Connect Webhooks Reference](https://docs.stripe.com/connect/webhooks)
- [Better Auth Documentation](https://docs.better-auth.com/)
