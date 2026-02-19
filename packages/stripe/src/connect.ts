import Stripe from "stripe";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { BetterAuthPlugin } from "better-auth/plugins";

/**
 * Stripe Connect integration for revenue sharing and automatic payment splitting
 *
 * @see https://docs.stripe.com/connect/webhooks
 */

export interface ConnectOptions {
  /**
   * Minimum charge amount in cents for payments to connected accounts
   * @default 100 (100 cents = $1.00)
   */
  minimumChargeAmount?: number;

  /**
   * Default application fee percentage taken from each charge
   * @default 5 (5%)
   */
  applicationFeePercent?: number;

  /**
   * Stripe Connect mode: standard, express, or custom
   * @default "express"
   */
  connectAccountType?: "standard" | "express" | "custom";

  /**
   * Capabilities to request for connected accounts
   * @default ["card_payments", "transfers"]
   */
  capabilities?: string[];

  /**
   * Countries to allow for connected accounts
   */
  supportedCountries?: string[];

  /**
   * URL to redirect after completing Connect onboarding
   */
  onboardingReturnUrl: string;

  /**
   * URL to redirect if onboarding is refreshed
   */
  onboardingRefreshUrl: string;

  /**
   * Called when a connected account is created
   */
  onAccountConnected?: (params: {
    userId: string;
    stripeAccountId: string;
    event: Stripe.Event;
  }) => Promise<void> | void;

  /**
   * Called when a connected account is updated
   */
  onAccountUpdated?: (params: {
    userId: string;
    stripeAccountId: string;
    event: Stripe.Event;
    status: Stripe.Account.Requirements;
  }) => Promise<void> | void;

  /**
   * Called when a capability is updated
   */
  onCapabilityUpdated?: (params: {
    userId: string;
    stripeAccountId: string;
    capability: string;
    status: "active" | "inactive" | "pending" | "unrequested";
  }) => Promise<void> | void;

  /**
   * Called when a payout is completed
   */
  onPayoutPaid?: (params: {
    userId: string;
    stripeAccountId: string;
    payout: Stripe.Payout;
  }) => Promise<void> | void;

  /**
   * Called when a chargeback occurs on a connected account
   */
  onChargeback?: (params: {
    userId: string;
    stripeAccountId: string;
    dispute: Stripe.Dispute;
  }) => Promise<void> | void;
}

export const connectTables = {
  connectedAccount: {
    fields: {
      id: { type: "string", required: true },
      userId: { type: "string", required: true },
      stripeAccountId: { type: "string", required: true },
      status: { type: "string" }, // e.g., "pending", "active", "restricted"
      chargesEnabled: { type: "boolean" },
      payoutsEnabled: { type: "boolean" },
      capabilities: { type: "json" },
      requirements: { type: "json" },
      country: { type: "string" },
      email: { type: "string" },
      businessType: { type: "string" },
      createdAt: { type: "date" },
      updatedAt: { type: "date" },
    },
  },
  connectTransaction: {
    fields: {
      id: { type: "string", required: true },
      stripePaymentIntentId: { type: "string" },
      stripeChargeId: { type: "string" },
      connectedAccountId: { type: "string", required: true },
      userId: { type: "string" }, // The end customer who paid
      amount: { type: "number" },
      applicationFeeAmount: { type: "number" },
      currency: { type: "string" },
      status: { type: "string" }, // pending, completed, failed, refunded
      transferredAt: { type: "date" },
      metadata: { type: "json" },
      createdAt: { type: "date" },
      updatedAt: { type: "date" },
    },
  },
};

/**
 * Creates Stripe Connect endpoints for better-auth
 */
export function createConnectEndpoints(
  stripe: Stripe,
  options: ConnectOptions
): BetterAuthPlugin["endpoints"] {
  return {
    /**
     * Create a new Stripe Connect account and return onboarding link
     */
    createConnectAccount: {
      method: "POST",
      path: "/connect/account",
      requireAuth: true,
      body: z.object({
        country: z.string().optional(),
        email: z.string().email().optional(),
        businessType: z.enum(["individual", "company"]).optional(),
        metadata: z.record(z.string()).optional(),
      }),
      handler: async (ctx) => {
        const session = ctx.context.session;
        if (!session?.user?.id) {
          throw new APIError("UNAUTHORIZED", {
            message: "User must be authenticated",
          });
        }

        const userId = session.user.id;
        const { country, email, businessType, metadata } = ctx.body;

        // Validate country if provided
        if (
          country &&
          options.supportedCountries &&
          !options.supportedCountries.includes(country)
        ) {
          throw new APIError("BAD_REQUEST", {
            message: "Country not supported",
          });
        }

        // Create the Stripe Connect account
        const account = await stripe.accounts.create({
          type: options.connectAccountType || "express",
          country,
          email,
          business_type: businessType,
          capabilities: (options.capabilities || ["card_payments", "transfers"]).reduce(
            (acc, cap) => ({ ...acc, [cap]: { requested: true } }),
            {}
          ),
          metadata: {
            betterAuthUserId: userId,
            ...metadata,
          },
        });

        // Store the connected account in database
        const adapter = ctx.context.adapter;
        await adapter.create({
          model: "connectedAccount",
          data: {
            id: generateId(),
            userId,
            stripeAccountId: account.id,
            status: "pending",
            chargesEnabled: false,
            payoutsEnabled: false,
            capabilities: {},
            country,
            email,
            businessType,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Create account onboarding link
        const accountLink = await stripe.accountLinks.create({
          account: account.id,
          refresh_url: options.onboardingRefreshUrl,
          return_url: options.onboardingReturnUrl,
          type: "account_onboarding",
        });

        return ctx.json({
          accountId: account.id,
          onboardingUrl: accountLink.url,
          expiresAt: accountLink.expires_at,
        });
      },
    },

    /**
     * Get the connected account status
     */
    getConnectAccount: {
      method: "GET",
      path: "/connect/account",
      requireAuth: true,
      handler: async (ctx) => {
        const session = ctx.context.session;
        if (!session) {
          throw new APIError("UNAUTHORIZED");
        }

        const userId = session.user.id;
        const adapter = ctx.context.adapter;

        const connectedAccount = await adapter.findOne({
          model: "connectedAccount",
          where: [{ field: "userId", value: userId }],
        });

        if (!connectedAccount) {
          throw new APIError("NOT_FOUND", {
            message: "No connected account found",
          });
        }

        // Fetch fresh data from Stripe
        const stripeAccount = await stripe.accounts.retrieve(
          connectedAccount.stripeAccountId
        );

        return ctx.json({
          account: {
            id: connectedAccount.id,
            stripeAccountId: stripeAccount.id,
            status: stripeAccount.capabilities?.card_payments === "active"
              ? "active"
              : "pending",
            chargesEnabled: stripeAccount.charges_enabled,
            payoutsEnabled: stripeAccount.payouts_enabled,
            capabilities: stripeAccount.capabilities,
            requirements: stripeAccount.requirements,
            country: stripeAccount.country,
            businessType: stripeAccount.business_type,
          },
        });
      },
    },

    /**
     * Create a payment that splits revenue with a connected account
     */
    createConnectPayment: {
      method: "POST",
      path: "/connect/payment",
      requireAuth: true,
      body: z.object({
        connectedAccountId: z.string(),
        amount: z.number().min(1),
        currency: z.string().default("usd"),
        description: z.string().optional(),
        applicationFeePercent: z.number().min(0).max(100).optional(),
        applicationFeeAmount: z.number().optional(),
        metadata: z.record(z.string()).optional(),
      }),
      handler: async (ctx) => {
        const session = ctx.context.session;
        if (!session) {
          throw new APIError("UNAUTHORIZED");
        }

        const {
          connectedAccountId,
          amount,
          currency,
          description,
          applicationFeePercent,
          applicationFeeAmount,
          metadata,
        } = ctx.body;

        const userId = session.user.id;
        const adapter = ctx.context.adapter;

        // Verify connected account exists and is active
        const connectedAccount = await adapter.findOne({
          model: "connectedAccount",
          where: [{ field: "stripeAccountId", value: connectedAccountId }],
        });

        if (!connectedAccount) {
          throw new APIError("NOT_FOUND", {
            message: "Connected account not found",
          });
        }

        // Check minimum charge amount
        const minAmount = options.minimumChargeAmount || 100;
        if (amount < minAmount) {
          throw new APIError("BAD_REQUEST", {
            message: `Amount must be at least ${minAmount} cents`,
          });
        }

        // Calculate application fee
        let feeAmount = applicationFeeAmount;
        if (feeAmount === undefined) {
          const feePercent =
            applicationFeePercent ?? options.applicationFeePercent ?? 5;
          feeAmount = Math.round((amount * feePercent) / 100);
        }

        // Create PaymentIntent with transfer to connected account
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency,
          description,
          application_fee_amount: feeAmount,
          transfer_data: {
            destination: connectedAccountId,
          },
          metadata: {
            betterAuthUserId: userId,
            connectedAccountId,
            ...metadata,
          },
        });

        // Record the transaction
        await adapter.create({
          model: "connectTransaction",
          data: {
            id: generateId(),
            stripePaymentIntentId: paymentIntent.id,
            connectedAccountId,
            userId,
            amount,
            applicationFeeAmount: feeAmount,
            currency,
            status: "pending",
            metadata,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        return ctx.json({
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        });
      },
    },

    /**
     * List transactions for a connected account
     */
    listConnectTransactions: {
      method: "GET",
      path: "/connect/transactions",
      requireAuth: true,
      query: z.object({
        limit: z.string().optional(),
        offset: z.string().optional(),
      }),
      handler: async (ctx) => {
        const session = ctx.context.session;
        if (!session) {
          throw new APIError("UNAUTHORIZED");
        }

        const userId = session.user.id;
        const adapter = ctx.context.adapter;

        // Get user's connected account
        const connectedAccount = await adapter.findOne({
          model: "connectedAccount",
          where: [{ field: "userId", value: userId }],
        });

        if (!connectedAccount) {
          throw new APIError("NOT_FOUND", {
            message: "No connected account found",
          });
        }

        const limit = parseInt(ctx.query?.limit || "20");
        const offset = parseInt(ctx.query?.offset || "0");

        const transactions = await adapter.findMany({
          model: "connectTransaction",
          where: [{ field: "connectedAccountId", value: connectedAccount.stripeAccountId }],
          limit,
          offset,
          sortBy: { field: "createdAt", direction: "desc" },
        });

        return ctx.json({ transactions });
      },
    },

    /**
     * Handle Connect webhook events
     */
    connectWebhook: {
      method: "POST",
      path: "/connect/webhook",
      handler: async (ctx) => {
        const body = await ctx.request.text();
        const sig = ctx.request.headers.get("stripe-signature");
        const endpointSecret = options.stripeConnectWebhookSecret;

        if (!sig || !endpointSecret) {
          throw new APIError("BAD_REQUEST", {
            message: "Missing signature or webhook secret",
          });
        }

        let event: Stripe.Event;
        try {
          event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
        } catch (err) {
          throw new APIError("BAD_REQUEST", {
            message: `Webhook signature verification failed: ${err.message}`,
          });
        }

        const adapter = ctx.context.adapter;

        // Handle Connect-specific events
        switch (event.type) {
          /**
           * Account events
           */
          case "account.updated": {
            const account = event.data.object as Stripe.Account;
            const userId = account.metadata?.betterAuthUserId;

            if (userId) {
              const connectedAccount = await adapter.findOne({
                model: "connectedAccount",
                where: [{ field: "stripeAccountId", value: account.id }],
              });

              if (connectedAccount) {
                await adapter.update({
                  model: "connectedAccount",
                  where: [{ field: "id", value: connectedAccount.id }],
                  update: {
                    chargesEnabled: account.charges_enabled,
                    payoutsEnabled: account.payouts_enabled,
                    capabilities: account.capabilities,
                    requirements: account.requirements,
                    status: account.charges_enabled ? "active" : "restricted",
                    updatedAt: new Date(),
                  },
                });

                await options.onAccountUpdated?.({
                  userId,
                  stripeAccountId: account.id,
                  event,
                  status: account.requirements,
                });
              }
            }
            break;
          }

          case "account.application.deauthorized": {
            const accountApp = event.data.object as Stripe.Account;
            const connectedAccount = await adapter.findOne({
              model: "connectedAccount",
              where: [{ field: "stripeAccountId", value: accountApp.id }],
            });

            if (connectedAccount) {
              await adapter.update({
                model: "connectedAccount",
                where: [{ field: "id", value: connectedAccount.id }],
                update: {
                  status: "deauthorized",
                  updatedAt: new Date(),
                },
              });
            }
            break;
          }

          /**
           * Capability events
           */
          case "capability.updated": {
            const capability = event.data.object as Stripe.Capability;
            const accountId = capability.account;

            const connectedAccount = await adapter.findOne({
              model: "connectedAccount",
              where: [{ field: "stripeAccountId", value: accountId }],
            });

            if (connectedAccount) {
              await options.onCapabilityUpdated?.({
                userId: connectedAccount.userId,
                stripeAccountId: accountId,
                capability: capability.id,
                status: capability.status,
              });
            }
            break;
          }

          /**
           * Payment and transfer events
           */
          case "payment_intent.succeeded": {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;

            if (paymentIntent.transfer_data?.destination) {
              const transaction = await adapter.findOne({
                model: "connectTransaction",
                where: [
                  { field: "stripePaymentIntentId", value: paymentIntent.id },
                ],
              });

              if (transaction) {
                await adapter.update({
                  model: "connectTransaction",
                  where: [{ field: "id", value: transaction.id }],
                  update: {
                    status: "completed",
                    stripeChargeId: paymentIntent.latest_charge as string,
                    transferredAt: new Date(),
                    updatedAt: new Date(),
                  },
                });
              }
            }
            break;
          }

          case "payment_intent.payment_failed": {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;

            if (paymentIntent.transfer_data?.destination) {
              const transaction = await adapter.findOne({
                model: "connectTransaction",
                where: [
                  { field: "stripePaymentIntentId", value: paymentIntent.id },
                ],
              });

              if (transaction) {
                await adapter.update({
                  model: "connectTransaction",
                  where: [{ field: "id", value: transaction.id }],
                  update: {
                    status: "failed",
                    updatedAt: new Date(),
                  },
                });
              }
            }
            break;
          }

          /**
           * Payout events
           */
          case "payout.paid": {
            const payout = event.data.object as Stripe.Payout;
            const accountId = payout.destination as string;

            const connectedAccount = await adapter.findOne({
              model: "connectedAccount",
              where: [{ field: "stripeAccountId", value: accountId }],
            });

            if (connectedAccount) {
              await options.onPayoutPaid?.({
                userId: connectedAccount.userId,
                stripeAccountId: accountId,
                payout,
              });
            }
            break;
          }

          /**
           * Dispute events
           */
          case "charge.dispute.created": {
            const dispute = event.data.object as Stripe.Dispute;
            const charge = await stripe.charges.retrieve(dispute.charge);

            if (charge.destination) {
              const connectedAccount = await adapter.findOne({
                model: "connectedAccount",
                where: [
                  { field: "stripeAccountId", value: charge.destination },
                ],
              });

              if (connectedAccount) {
                await options.onChargeback?.({
                  userId: connectedAccount.userId,
                  stripeAccountId: charge.destination,
                  dispute,
                });
              }
            }
            break;
          }
        }

        return ctx.json({ received: true });
      },
    },
  };
}

function generateId(): string {
  // Use @better-auth/utils/id if available, or implement simple ID generation
  return "_" + Math.random().toString(36).substring(2, 9);
}

export function stripeConnect(options: StripeOptions & { connect?: ConnectOptions }) {
  return {
    id: "stripe-connect",
    endpoints: options.connect ? createConnectEndpoints(options.stripe, options.connect) : {},
    hooks: {
      before: [],
      after: [],
    },
  };
}

export interface StripeOptions {
  stripe: Stripe;
  stripeWebhookSecret: string;
  stripeConnectWebhookSecret: string;
}
