# Quick Start: Building Your Payment Gateway Library

After studying better-auth, here's how to start building your payment gateway abstraction library.

## 🚀 Project Setup

### Step 1: Create Monorepo Structure

```bash
mkdir better-payments
cd better-payments

# Initialize pnpm workspace
pnpm init

# Create packages
mkdir -p packages/core/src/providers
mkdir -p packages/core/src/types
mkdir -p packages/better-payments/src
mkdir -p packages/stripe-plugin/src
mkdir -p examples/nextjs
```

### Step 2: Create `pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'
  - 'examples/*'
```

### Step 3: Create Root `package.json`

```json
{
  "name": "better-payments-workspace",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm -r --parallel dev",
    "test": "pnpm -r test"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "tsup": "^8.0.0"
  }
}
```

---

## 📝 Step-by-Step Implementation

### Phase 1: Core Types

**File:** `packages/core/src/types/provider.ts`

```typescript
/**
 * Core payment provider interface
 * Inspired by better-auth's OAuthProvider
 */

export interface PaymentIntent {
    id: string;
    amount: number;
    currency: string;
    status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';
    clientSecret?: string;
    paymentUrl?: string;
    metadata?: Record<string, any>;
}

export interface PaymentStatus {
    id: string;
    status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';
    amount: number;
    currency: string;
    paid: boolean;
    metadata?: Record<string, any>;
}

export interface WebhookEvent {
    type: string;
    paymentId: string;
    status: PaymentStatus['status'];
    data: any;
}

export interface Refund {
    id: string;
    paymentId: string;
    amount: number;
    status: 'pending' | 'succeeded' | 'failed';
    reason?: string;
}

export interface CreatePaymentData {
    amount: number;
    currency: string;
    customerId?: string;
    customerEmail?: string;
    description?: string;
    metadata?: Record<string, any>;
    returnUrl?: string;
}

// Base options that all providers share
export interface ProviderOptions<TProfile = any> {
    // Provider credentials
    apiKey?: string;
    secretKey?: string;
    publicKey?: string;
    webhookSecret?: string;

    // Environment
    environment?: 'sandbox' | 'production' | 'test';

    // Customization
    onPaymentSuccess?: (payment: PaymentStatus) => Promise<void> | void;
    onPaymentFailure?: (payment: PaymentStatus) => Promise<void> | void;
    mapPaymentData?: (data: TProfile) => Partial<PaymentStatus>;
}

// Main provider interface
export interface PaymentProvider<
    TProviderData extends Record<string, any> = Record<string, any>,
    TOptions extends Record<string, any> = Partial<ProviderOptions>
> {
    id: string;  // "stripe", "flutterwave", "paystack"
    name: string;  // "Stripe", "Flutterwave", "PayStack"

    // Required methods
    createPaymentIntent: (data: CreatePaymentData) => Promise<PaymentIntent>;

    verifyPayment: (paymentId: string) => Promise<PaymentStatus>;

    handleWebhook: (payload: any, signature: string) => Promise<WebhookEvent>;

    // Optional methods
    refundPayment?: (paymentId: string, amount?: number, reason?: string) => Promise<Refund>;

    cancelPayment?: (paymentId: string) => Promise<PaymentStatus>;

    getPayment?: (paymentId: string) => Promise<PaymentStatus>;

    // Configuration
    options?: TOptions;
}

export type LiteralString = string & {};
```

---

### Phase 2: First Provider (Stripe)

**File:** `packages/core/src/providers/stripe.ts`

```typescript
import Stripe from 'stripe';
import type { PaymentProvider, ProviderOptions, CreatePaymentData } from '../types/provider.js';

export interface StripeProfile {
    id: string;
    object: string;
    amount: number;
    currency: string;
    status: string;
    // ... add more Stripe-specific fields
}

export interface StripeOptions extends ProviderOptions<StripeProfile> {
    apiKey: string;
    webhookSecret: string;
    apiVersion?: string;
}

export const stripe = (options: StripeOptions) => {
    // Initialize Stripe client
    const stripeClient = new Stripe(options.apiKey, {
        apiVersion: options.apiVersion || '2023-10-16',
    });

    return {
        id: 'stripe' as const,
        name: 'Stripe',

        async createPaymentIntent(data: CreatePaymentData) {
            const paymentIntent = await stripeClient.paymentIntents.create({
                amount: data.amount,
                currency: data.currency,
                customer: data.customerId,
                description: data.description,
                metadata: data.metadata || {},
                // Enable automatic payment methods
                automatic_payment_methods: {
                    enabled: true,
                },
            });

            return {
                id: paymentIntent.id,
                amount: paymentIntent.amount,
                currency: paymentIntent.currency,
                status: mapStripeStatus(paymentIntent.status),
                clientSecret: paymentIntent.client_secret || undefined,
                metadata: paymentIntent.metadata,
            };
        },

        async verifyPayment(paymentId: string) {
            const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentId);

            const status: PaymentStatus = {
                id: paymentIntent.id,
                status: mapStripeStatus(paymentIntent.status),
                amount: paymentIntent.amount,
                currency: paymentIntent.currency,
                paid: paymentIntent.status === 'succeeded',
                metadata: paymentIntent.metadata,
            };

            // Call custom handler if provided
            if (status.paid && options.onPaymentSuccess) {
                await options.onPaymentSuccess(status);
            }

            return status;
        },

        async handleWebhook(payload: any, signature: string) {
            let event: Stripe.Event;

            try {
                event = stripeClient.webhooks.constructEvent(
                    payload,
                    signature,
                    options.webhookSecret
                );
            } catch (err) {
                throw new Error(`Webhook signature verification failed: ${err.message}`);
            }

            const paymentIntent = event.data.object as Stripe.PaymentIntent;

            return {
                type: event.type,
                paymentId: paymentIntent.id,
                status: mapStripeStatus(paymentIntent.status),
                data: event.data.object,
            };
        },

        async refundPayment(paymentId: string, amount?: number, reason?: string) {
            const refund = await stripeClient.refunds.create({
                payment_intent: paymentId,
                amount,
                reason: reason as Stripe.RefundCreateParams.Reason,
            });

            return {
                id: refund.id,
                paymentId: paymentId,
                amount: refund.amount,
                status: refund.status === 'succeeded' ? 'succeeded' :
                        refund.status === 'pending' ? 'pending' : 'failed',
                reason,
            };
        },

        async cancelPayment(paymentId: string) {
            const paymentIntent = await stripeClient.paymentIntents.cancel(paymentId);

            return {
                id: paymentIntent.id,
                status: mapStripeStatus(paymentIntent.status),
                amount: paymentIntent.amount,
                currency: paymentIntent.currency,
                paid: false,
            };
        },

        async getPayment(paymentId: string) {
            return this.verifyPayment(paymentId);
        },

        options,
    } satisfies PaymentProvider<StripeProfile, StripeOptions>;
};

// Helper function to map Stripe statuses to our standard statuses
function mapStripeStatus(status: string): PaymentStatus['status'] {
    switch (status) {
        case 'requires_payment_method':
        case 'requires_confirmation':
        case 'requires_action':
            return 'pending';
        case 'processing':
            return 'processing';
        case 'succeeded':
            return 'succeeded';
        case 'canceled':
            return 'canceled';
        default:
            return 'failed';
    }
}
```

---

### Phase 3: Second Provider (Flutterwave)

**File:** `packages/core/src/providers/flutterwave.ts`

```typescript
import type { PaymentProvider, ProviderOptions, CreatePaymentData } from '../types/provider.js';

export interface FlutterwaveProfile {
    id: number;
    tx_ref: string;
    flw_ref: string;
    amount: number;
    currency: string;
    status: string;
    // ... add more Flutterwave-specific fields
}

export interface FlutterwaveOptions extends ProviderOptions<FlutterwaveProfile> {
    publicKey: string;
    secretKey: string;
    encryptionKey: string;
    environment?: 'sandbox' | 'production';
}

export const flutterwave = (options: FlutterwaveOptions) => {
    const baseURL = options.environment === 'production'
        ? 'https://api.flutterwave.com/v3'
        : 'https://api.flutterwave.com/v3';  // Same for both

    return {
        id: 'flutterwave' as const,
        name: 'Flutterwave',

        async createPaymentIntent(data: CreatePaymentData) {
            const txRef = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            const response = await fetch(`${baseURL}/payments`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${options.secretKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    tx_ref: txRef,
                    amount: data.amount,
                    currency: data.currency,
                    redirect_url: data.returnUrl,
                    customer: {
                        email: data.customerEmail,
                        ...(data.customerId && { customer_id: data.customerId }),
                    },
                    customizations: {
                        title: data.description || 'Payment',
                    },
                    meta: data.metadata,
                }),
            });

            if (!response.ok) {
                throw new Error(`Flutterwave API error: ${response.statusText}`);
            }

            const result = await response.json();

            return {
                id: result.data.id.toString(),
                amount: data.amount,
                currency: data.currency,
                status: 'pending',
                paymentUrl: result.data.link,
                metadata: { tx_ref: txRef, ...data.metadata },
            };
        },

        async verifyPayment(paymentId: string) {
            const response = await fetch(
                `${baseURL}/transactions/${paymentId}/verify`,
                {
                    headers: {
                        'Authorization': `Bearer ${options.secretKey}`,
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`Flutterwave verification error: ${response.statusText}`);
            }

            const result = await response.json();
            const data = result.data;

            const status: PaymentStatus = {
                id: data.id.toString(),
                status: mapFlutterwaveStatus(data.status),
                amount: data.amount,
                currency: data.currency,
                paid: data.status === 'successful',
                metadata: data.meta,
            };

            if (status.paid && options.onPaymentSuccess) {
                await options.onPaymentSuccess(status);
            }

            return status;
        },

        async handleWebhook(payload: any, signature: string) {
            // Verify webhook signature
            const crypto = await import('crypto');
            const hash = crypto
                .createHmac('sha256', options.encryptionKey)
                .update(JSON.stringify(payload))
                .digest('hex');

            if (hash !== signature) {
                throw new Error('Invalid webhook signature');
            }

            return {
                type: payload.event,
                paymentId: payload.data.id.toString(),
                status: mapFlutterwaveStatus(payload.data.status),
                data: payload.data,
            };
        },

        async refundPayment(paymentId: string, amount?: number) {
            const response = await fetch(`${baseURL}/transactions/${paymentId}/refund`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${options.secretKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    amount,
                }),
            });

            if (!response.ok) {
                throw new Error(`Flutterwave refund error: ${response.statusText}`);
            }

            const result = await response.json();

            return {
                id: result.data.id.toString(),
                paymentId,
                amount: result.data.amount,
                status: 'succeeded',
            };
        },

        options,
    } satisfies PaymentProvider<FlutterwaveProfile, FlutterwaveOptions>;
};

function mapFlutterwaveStatus(status: string): PaymentStatus['status'] {
    switch (status) {
        case 'successful':
            return 'succeeded';
        case 'failed':
            return 'failed';
        case 'pending':
            return 'pending';
        default:
            return 'processing';
    }
}
```

---

### Phase 4: Provider Registry

**File:** `packages/core/src/providers/index.ts`

```typescript
import { stripe } from './stripe.js';
import { flutterwave } from './flutterwave.js';

export const paymentProviders = {
    stripe,
    flutterwave,
    // Add more providers here
} as const;

export const paymentProviderList = Object.keys(paymentProviders) as [
    'stripe',
    ...(keyof typeof paymentProviders)[],
];

export type PaymentProviderList = typeof paymentProviderList;

export type PaymentProviders = {
    [K in PaymentProviderList[number]]?: Parameters<
        (typeof paymentProviders)[K]
    >[0] & {
        enabled?: boolean;
    };
};

// Re-export providers
export { stripe } from './stripe.js';
export { flutterwave } from './flutterwave.js';
export type { StripeOptions } from './stripe.js';
export type { FlutterwaveOptions } from './flutterwave.js';
```

---

### Phase 5: Main Configuration

**File:** `packages/core/src/types/options.ts`

```typescript
import type { PaymentProviders } from '../providers/index.js';

export interface PaymentGatewayOptions {
    /**
     * Payment providers configuration
     */
    providers: PaymentProviders;

    /**
     * Default currency for payments
     * @default "USD"
     */
    defaultCurrency?: string;

    /**
     * Webhook configuration
     */
    webhooks?: {
        /**
         * Path for webhook endpoint
         * @default "/api/payments/webhook"
         */
        path?: string;

        /**
         * Handle webhook events
         */
        onEvent?: (event: WebhookEvent) => Promise<void> | void;
    };

    /**
     * Plugins
     */
    plugins?: PaymentPlugin[];

    /**
     * Advanced options
     */
    advanced?: {
        /**
         * Retry failed payments automatically
         */
        retryFailedPayments?: boolean;

        /**
         * Auto refund on cancellation
         */
        autoRefundOnCancel?: boolean;

        /**
         * Enable logging
         */
        logging?: boolean;
    };
}

export interface PaymentPlugin {
    id: string;
    init?: (context: any) => Promise<void> | void;
    endpoints?: Record<string, any>;
}
```

---

### Phase 6: Main Factory Function

**File:** `packages/better-payments/src/index.ts`

```typescript
import type { PaymentGatewayOptions } from '@better-payments/core/types/options';
import { paymentProviders } from '@better-payments/core/providers';
import type { PaymentProvider } from '@better-payments/core/types/provider';

export const betterPayments = <Options extends PaymentGatewayOptions>(
    options: Options
) => {
    // Instantiate providers from configuration
    const providers = Object.entries(options.providers || {})
        .map(([key, config]) => {
            if (!config || config.enabled === false) {
                return null;
            }

            const providerFactory = paymentProviders[key as keyof typeof paymentProviders];
            if (!providerFactory) {
                console.warn(`Provider ${key} not found`);
                return null;
            }

            return providerFactory(config as any);
        })
        .filter((p): p is PaymentProvider => p !== null);

    // Helper to find provider
    const findProvider = (providerId: string) => {
        const provider = providers.find(p => p.id === providerId);
        if (!provider) {
            throw new Error(`Provider ${providerId} not found or not enabled`);
        }
        return provider;
    };

    return {
        /**
         * Payment operations
         */
        payment: {
            /**
             * Create a new payment
             */
            create: async (providerId: string, data: CreatePaymentData) => {
                const provider = findProvider(providerId);
                return provider.createPaymentIntent({
                    ...data,
                    currency: data.currency || options.defaultCurrency || 'USD',
                });
            },

            /**
             * Verify a payment
             */
            verify: async (providerId: string, paymentId: string) => {
                const provider = findProvider(providerId);
                return provider.verifyPayment(paymentId);
            },

            /**
             * Refund a payment
             */
            refund: async (providerId: string, paymentId: string, amount?: number, reason?: string) => {
                const provider = findProvider(providerId);
                if (!provider.refundPayment) {
                    throw new Error(`Provider ${providerId} does not support refunds`);
                }
                return provider.refundPayment(paymentId, amount, reason);
            },

            /**
             * Cancel a payment
             */
            cancel: async (providerId: string, paymentId: string) => {
                const provider = findProvider(providerId);
                if (!provider.cancelPayment) {
                    throw new Error(`Provider ${providerId} does not support cancellation`);
                }
                return provider.cancelPayment(paymentId);
            },

            /**
             * Get payment details
             */
            get: async (providerId: string, paymentId: string) => {
                const provider = findProvider(providerId);
                if (provider.getPayment) {
                    return provider.getPayment(paymentId);
                }
                return provider.verifyPayment(paymentId);
            },
        },

        /**
         * HTTP handler for webhooks
         */
        handler: async (request: Request) => {
            const url = new URL(request.url);
            const webhookPath = options.webhooks?.path || '/api/payments/webhook';

            if (!url.pathname.endsWith(webhookPath)) {
                return new Response('Not found', { status: 404 });
            }

            // Extract provider from query or header
            const providerId = url.searchParams.get('provider') ||
                               request.headers.get('x-payment-provider');

            if (!providerId) {
                return new Response('Provider not specified', { status: 400 });
            }

            const provider = findProvider(providerId);

            // Get signature from headers
            const signature = request.headers.get(`${providerId}-signature`) ||
                            request.headers.get('stripe-signature') ||
                            request.headers.get('verif-hash') || '';

            try {
                const payload = await request.text();
                const event = await provider.handleWebhook(JSON.parse(payload), signature);

                // Call webhook handler
                if (options.webhooks?.onEvent) {
                    await options.webhooks.onEvent(event);
                }

                return new Response(JSON.stringify({ received: true }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            } catch (error) {
                console.error('Webhook error:', error);
                return new Response(
                    JSON.stringify({ error: error.message }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                );
            }
        },

        /**
         * Configuration
         */
        options,

        /**
         * List of enabled providers
         */
        providers: providers.map(p => ({ id: p.id, name: p.name })),
    };
};

// Re-export types
export type { PaymentGatewayOptions } from '@better-payments/core/types/options';
export type { PaymentProvider, CreatePaymentData, PaymentIntent, PaymentStatus } from '@better-payments/core/types/provider';
```

---

## 🎯 Usage Example

**File:** `examples/nextjs/app/api/payments/route.ts`

```typescript
import { betterPayments } from 'better-payments';

const payments = betterPayments({
    providers: {
        stripe: {
            apiKey: process.env.STRIPE_SECRET_KEY!,
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
            onPaymentSuccess: async (payment) => {
                console.log('Payment succeeded:', payment.id);
                // Send email, update database, etc.
            },
        },
        flutterwave: {
            publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY!,
            secretKey: process.env.FLUTTERWAVE_SECRET_KEY!,
            encryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY!,
        },
    },
    defaultCurrency: 'USD',
});

// Create payment endpoint
export async function POST(request: Request) {
    const { provider, amount, currency } = await request.json();

    try {
        const payment = await payments.payment.create(provider, {
            amount,
            currency,
            customerEmail: 'customer@example.com',
            description: 'Test payment',
        });

        return Response.json(payment);
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

// Webhook endpoint
export async function POST_WEBHOOK(request: Request) {
    return payments.handler(request);
}
```

---

## ✅ What You've Built

After following this guide, you have:

- ✅ Core provider interface
- ✅ Stripe provider implementation
- ✅ Flutterwave provider implementation
- ✅ Provider registry system
- ✅ Type-safe configuration
- ✅ Main factory function
- ✅ Webhook handling
- ✅ Framework-agnostic API

---

## 🎓 Next Steps

1. **Add more providers** (PayStack, PayPal, Square)
2. **Add plugins** (subscriptions, invoicing, split payments)
3. **Add database support** (save payment records)
4. **Add React hooks** (usePayment, useSubscription)
5. **Add documentation** (README, API reference)
6. **Add tests** (unit tests, integration tests)
7. **Publish to npm** (better-payments)

---

**You've got the foundation! Start building!** 🚀
