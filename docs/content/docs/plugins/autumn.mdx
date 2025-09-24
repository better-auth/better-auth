---
title: Autumn Billing
description: Better Auth Plugin for Autumn Billing
---

import { HomeIcon } from "lucide-react";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";

[Autumn](https://useautumn.com) is open source infrastructure to run SaaS pricing plans. It sits between your app and Stripe, and acts as the database for your customers' subscription status, usage metering and feature permissions.

<Card href="https://discord.gg/STqxY92zuS" title="Get help on Autumn's Discord">
  We're online to help you with any questions you have.
</Card>

## Features

- One function for all checkout, subscription and payment flows
- No webhooks required: query Autumn for the data you need
- Manages your application's free and paid plans
- Usage tracking for usage billing and periodic limits
- Custom plans and pricing changes through Autumn's dashboard


<Steps>
  <Step>
    ### Setup Autumn Account
    First, create your pricing plans in Autumn's [dashboard](https://app.useautumn.com), where you define what each plan and product gets access to and how it should be billed. In this example, we're handling the free and pro plans for an AI chatbot, which comes with a number of `messages` per month.
  </Step>
  <Step>
    ### Install Autumn SDK

    ```package-install
    autumn-js
    ```
    <Callout>
      If you're using a separate client and server setup, make sure to install the plugin in both parts of your project.
    </Callout>
  </Step>

  <Step>
    ### Add `AUTUMN_SECRET_KEY` to your environment variables

    You can find it in Autumn's dashboard under "[Developer](https://app.useautumn.com/sandbox/onboarding)".

    ```bash title=".env"
    AUTUMN_SECRET_KEY=am_sk_xxxxxxxxxx
    ```
  </Step>

  <Step>
    ### Add the Autumn plugin to your `auth` config

    <Tabs items={["User", "Organization", "User & Organization", "Custom"]}>
    <Tab value="User">

    ```ts title="auth.ts"
    import { autumn } from "autumn-js/better-auth";

    export const auth = betterAuth({
      // ...
      plugins: [autumn()],
    });
    ```

    </Tab>
    <Tab value="Organization">

    ```ts title="auth.ts"
    import { autumn } from "autumn-js/better-auth";
    import { organization } from "better-auth/plugins";

    export const auth = betterAuth({
      // ...
      plugins: [organization(), autumn({ customerScope: "organization" })],
    });
    ```

    </Tab>
    <Tab value="User & Organization">

    ```ts title="auth.ts"
    import { autumn } from "autumn-js/better-auth";
    import { organization } from "better-auth/plugins";

    export const auth = betterAuth({
      // ...
      plugins: [
        organization(),
        autumn({ customerScope: "user_and_organization" })
      ],
    });
    ```

    </Tab>
    <Tab value="Custom">

    ```ts title="auth.ts"
    import { autumn } from "autumn-js/better-auth";
    import { organization } from "better-auth/plugins";

    export const auth = betterAuth({
      // ...
      plugins: [
        organization(),
        autumn({
          identify: async ({ session, organization }) => {
            return {
              customerId: "your_customer_id",
              customerData: {
                name: "Customer Name",
                email: "customer@gmail.com",
              },
            };
          },
        }),
      ],
    });
    ```

    </Tab>
    </Tabs>

  <Callout>
    Autumn will auto-create your customers when they sign up, and assign them any
    default plans you created (eg your Free plan). You can choose who becomes a customer: individual users, organizations, both, or something custom like workspaces.
  </Callout>
  </Step>

  <Step>
      ### Add `<AutumnProvider />`

      Client side, wrap your application with the AutumnProvider component, and pass in the `baseUrl` that you define within better-auth's `authClient`.

      ```tsx title="app/layout.tsx"
      import { AutumnProvider } from "autumn-js/react";

      export default function RootLayout({
        children,
      }: {
        children: React.ReactNode;
      }) {
        return (
          <html>
            <body>
              {/* or meta.env.BETTER_AUTH_URL for vite */}
              <AutumnProvider betterAuthUrl={process.env.NEXT_PUBLIC_BETTER_AUTH_URL}>
                {children}
              </AutumnProvider>
            </body>
          </html>
        );
      }
      ```
  </Step>  
</Steps>

## Usage

### Handle payments

Call `attach` to redirect the customer to a Stripe checkout page when they want to purchase the Pro plan.

If their payment method is already on file, `AttachDialog` will open instead to let the customer confirm their new subscription or purchase, and handle the payment.

<Callout type="warn">
  {" "}
  Make sure you've pasted in your [Stripe test secret
  key](https://dashboard.stripe.com/test/apikeys) in the [Autumn
  dashboard](https://app.useautumn.com/integrations/stripe).
</Callout>

```tsx
import { useCustomer, AttachDialog } from "autumn-js/react";

export default function PurchaseButton() {
  const { attach } = useCustomer();

  return (
    <button
      onClick={async () => {
        await attach({
          productId: "pro",
          dialog: AttachDialog,
        });
      }}
    >
      Upgrade to Pro
    </button>
  );
}
```

The AttachDialog component can be used directly from the `autumn-js/react`
library (as shown in the example above), or downloaded as a [shadcn/ui component](https://docs.useautumn.com/quickstart/shadcn) to customize.

### Integrate Pricing Logic

Integrate your client and server pricing tiers logic with the following functions:

- `check` to see if the customer is `allowed` to send a message.
- `track` a usage event in Autumn (typically done server-side)
- `customer` to display any relevant billing data in your UI (subscriptions, feature balances)

Server-side, you can access Autumn's functions through the `auth` object.

<Tabs items={["Client", "Server"]}>
<Tab value="Client">

```jsx
import { useCustomer } from "autumn-js/react";

export default function SendChatMessage() {
  const { customer, allowed, refetch } = useCustomer();

  return (
    <>
      <button
        onClick={async () => {
          if (allowed({ featureId: "messages" })) {
            //... send chatbot message server-side, then
            await refetch(); // refetch customer usage data
            alert(
              "Remaining messages: " + customer?.features.messages?.balance
            );
          } else {
            alert("You're out of messages");
          }
        }}
      >
        Send Message
      </button>
    </>
  );
}
```

</Tab>
<Tab value="Server">

```typescript Server
import { auth } from "@/lib/auth";

// check on the backend if the customer can send a message
const { allowed } = await auth.api.check({
  headers: await headers(), // pass the request headers
  body: {
    featureId: "messages",
  },
});

// server-side function to send the message

// then track the usage
await auth.api.track({
  headers: await headers(),
  body: {
    featureId: "messages",
    value: 2,
  },
});
```

</Tab>
</Tabs>

### Additional Functions

#### openBillingPortal()

Opens a billing portal where the customer can update their payment method or cancel their plan.

```tsx
import { useCustomer } from "autumn-js/react";

export default function BillingSettings() {
  const { openBillingPortal } = useCustomer();

  return (
    <button
      onClick={async () => {
        await openBillingPortal({
          returnUrl: "/settings/billing",
        });
      }}
    >
      Manage Billing
    </button>
  );
}
```

#### cancel()

Cancel a product or subscription.

```tsx
import { useCustomer } from "autumn-js/react";

export default function CancelSubscription() {
  const { cancel } = useCustomer();

  return (
    <button
      onClick={async () => {
        await cancel({ productId: "pro" });
      }}
    >
      Cancel Subscription
    </button>
  );
}
```

#### Get invoice history

Pass in an `expand` param into `useCustomer` to get additional information. You can expand `invoices`, `trials_used`, `payment_method`, or `rewards`.

```tsx
import { useCustomer } from "autumn-js/react";

export default function CustomerProfile() {
  const { customer } = useCustomer({ expand: ["invoices"] });

  return (
    <div>
      <h2>Customer Profile</h2>
      <p>Name: {customer?.name}</p>
      <p>Email: {customer?.email}</p>
      <p>Balance: {customer?.features.chat_messages?.balance}</p>
    </div>
  );
}
```
