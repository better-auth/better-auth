---
title: Dodo Payments
description: Better Auth Plugin for Dodo Payments
---

[Dodo Payments](https://dodopayments.com) is a global Merchant-of-Record platform that lets AI, SaaS and digital businesses sell in 150+ countries without touching tax, fraud, or compliance. A single, developer-friendly API powers checkout, billing, and payouts so you can launch worldwide in minutes.

<Card
  href="https://discord.gg/bYqAp4ayYh"
  title="Get support on Dodo Payments' Discord"
>
  This plugin is maintained by the Dodo Payments team.<br />
  Have questions? Our team is available on Discord to assist you anytime.
</Card>

## Features

- Automatic customer creation on sign-up
- Type-safe checkout flows with product slug mapping
- Self-service customer portal
- Real-time webhook event processing with signature verification

<Card href="https://app.dodopayments.com" title="Get started with Dodo Payments">
  You need a Dodo Payments account and API keys to use this integration.
</Card>

## Installation

<Steps>
  <Step title="Install dependencies">
    Run the following command in your project root:
```bash
npm install @dodopayments/better-auth dodopayments better-auth zod
```
  
  </Step>
  <Step title="Configure environment variables">
    Add these to your `.env` file:
```txt
DODO_PAYMENTS_API_KEY=your_api_key_here
DODO_PAYMENTS_WEBHOOK_SECRET=your_webhook_secret_here
```
  </Step>

  <Step title="Set up server-side integration">
    Create or update `src/lib/auth.ts`:
```typescript
import { betterAuth } from "better-auth";
import {
  dodopayments,
  checkout,
  portal,
  webhooks,
} from "@dodopayments/better-auth";
import DodoPayments from "dodopayments";

export const dodoPayments = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment: "test_mode"
});

export const auth = betterAuth({
  plugins: [
    dodopayments({
      client: dodoPayments,
      createCustomerOnSignUp: true,
      use: [
        checkout({
          products: [
            {
              productId: "pdt_xxxxxxxxxxxxxxxxxxxxx",
              slug: "premium-plan",
            },
          ],
          successUrl: "/dashboard/success",
          authenticatedUsersOnly: true,
        }),
        portal(),
        webhooks({
          webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_SECRET!,
          onPayload: async (payload) => {
            console.log("Received webhook:", payload.event_type);
          },
        }),
      ],
    }),
  ],
});
```
    <Card>
      Set `environment` to `live_mode` for production.
    </Card>
  </Step>

  <Step title="Set up client-side integration">
    Create or update `src/lib/auth-client.ts`:
```typescript
import { dodopaymentsClient } from "@dodopayments/better-auth";

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  plugins: [dodopaymentsClient()],
});
```
  </Step>
</Steps>

## Usage

### Creating a Checkout Session

```typescript
const { data: checkout, error } = await authClient.dodopayments.checkout({
  slug: "premium-plan",
  customer: {
    email: "customer@example.com",
    name: "John Doe",
  },
  billing: {
    city: "San Francisco",
    country: "US",
    state: "CA",
    street: "123 Market St",
    zipcode: "94103",
  },
  referenceId: "order_123",
});

if (checkout) {
  window.location.href = checkout.url;
}
```

### Accessing the Customer Portal

```typescript
const { data: customerPortal, error } = await authClient.dodopayments.customer.portal();
if (customerPortal && customerPortal.redirect) {
  window.location.href = customerPortal.url;
}
```

### Listing Customer Data

```typescript
// Get subscriptions
const { data: subscriptions, error } =
  await authClient.dodopayments.customer.subscriptions.list({
    query: {
      limit: 10,
      page: 1,
      active: true,
    },
  });

// Get payment history
const { data: payments, error } = await authClient.dodopayments.customer.payments.list({
  query: {
    limit: 10,
    page: 1,
    status: "succeeded",
  },
});
```

### Webhooks

<Card>
  The webhooks plugin processes real-time payment events from Dodo Payments with secure signature verification. The default endpoint is `/api/auth/dodopayments/webhooks`.
</Card>

<Steps>
  <Step title="Generate and set webhook secret">
    Generate a webhook secret for your endpoint URL (e.g., `https://your-domain.com/api/auth/dodopayments/webhooks`) in the Dodo Payments Dashboard and set it in your .env file:
```txt
DODO_PAYMENTS_WEBHOOK_SECRET=your_webhook_secret_here
```
  </Step>

  <Step title="Handle webhook events">
    Example handler:
```typescript
webhooks({
  webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_SECRET!,
  onPayload: async (payload) => {
    console.log("Received webhook:", payload.event_type);
  },
});
```
  </Step>
</Steps>

## Configuration Reference

### Plugin Options

- **client** (required): DodoPayments client instance
- **createCustomerOnSignUp** (optional): Auto-create customers on user signup  
- **use** (required): Array of plugins to enable (checkout, portal, webhooks)

### Checkout Plugin Options

- **products**: Array of products or async function returning products
- **successUrl**: URL to redirect after successful payment
- **authenticatedUsersOnly**: Require user authentication (default: false)

If you encounter any issues, please refer to the [Dodo Payments documentation](https://docs.dodopayments.com) for troubleshooting steps.
