import {
	type AuthContext,
	type BetterAuthPlugin,
	type Expand,
	type Session,
	type User,
	APIError,
	betterAuth,
} from "better-auth";
import { createAuthEndpoint } from "better-auth/plugins";
import Stripe from "stripe";
import { z } from "zod";
import { sessionMiddleware } from "better-auth/api";

export const stripeClient = new Stripe(`${process.env.STRIPE_SECRET_KEY}`, {
	apiVersion: "2025-01-27.acacia",
	appInfo: {
		name: "Dub.co",
		version: "0.1.0",
	},
});

type Plan =
	| {
			priceId?: string;
			name: string;
			type: "free";
			limits?: Record<string, number>;
	  }
	| {
			priceId: string;
			name: string;
			type: "paid";
			limits?: Record<string, number>;
	  };

interface Subscription {
	plan: string;
}

interface StripeOptions {
	/**
	 * Stripe Client
	 */
	stripeClient: Stripe;
	/**
	 * Subscription Configuration
	 */
	subscription?: {
		/**
		 * Enable subscriptions
		 */
		enabled: boolean;
		/**
		 * List of plan
		 */
		plans: Plan[];
		/**
		 * Default plan to create subscription, when a user sign up.
		 */
		defaultPlan?: string;
		/**
		 * Success URL to pass to stripe to redirect after successful checkout
		 *
		 * You can also pass a function that returns a string
		 *
		 * @example
		 * ```ts
		 * successURL: async(data, request)=>{
		 * 	return `/user/${data.user.id}`
		 * }
		 * ```
		 */
		successURL?:
			| string
			| ((
					data: {
						user: User & Record<string, any>;
						subscription: Subscription;
						session: Session & Record<string, any>;
					},
					request: Request,
			  ) => Promise<string>);
		/**
		 * Cancel URL to pass to stripe to redirect after checkout is cancelled
		 *
		 * You can also pass a function that returns a string
		 *
		 * @example
		 * ```ts
		 * cancelURL: async(data, request)=>{
		 * 	return `/workspace/${data.session.organizationId}`
		 * }
		 * ```
		 */
		cancelURL?:
			| string
			| ((
					data: {
						user: User & Record<string, any>;
						subscription: Subscription;
						session: Session & Record<string, any>;
					},
					request: Request,
			  ) => Promise<string>);
	};
	onCheckoutSessionComplete?: (
		event: Stripe.Event,
		subscription?: Subscription | null,
	) => Promise<void>;
}

async function checkoutSessionCompleted(
	ctx: AuthContext,
	options: StripeOptions,
	event: Stripe.Event,
) {
	const client = options.stripeClient;
	const checkoutSession = event.data.object as Stripe.Checkout.Session;
	if (checkoutSession.mode === "setup") {
		return;
	}
	if (options.subscription?.enabled) {
		const subscription = await client.subscriptions.retrieve(
			checkoutSession.subscription as string,
		);
		const priceId = subscription.items.data[0]?.price.id;
		const plan = options.subscription?.plans.find(
			(plan) => plan.priceId === priceId,
		);
		if (plan) {
			const referenceId = checkoutSession?.client_reference_id;
			if (!referenceId) {
				return;
			}
			const subscription = await ctx.adapter.update<Subscription>({
				model: "subscription",
				where: [
					{
						field: "referenceId",
						value: referenceId,
					},
				],
				update: {
					plan: plan.name,
					stripeId: checkoutSession.customer?.toString(),
					billingCycleStart: new Date().getDate(),
				},
			});
			await options.onCheckoutSessionComplete?.(event, subscription);
		}
	}
}

const STRIPE_ERROR_CODES = {
	SUBSCRIPTION_NOT_FOUND: "subscription not found",
	SUBSCRIPTION_PLAN_NOT_FOUND: "subscription plan not found",
};

export const stripe = <O extends StripeOptions>(options: Expand<O>) => {
	const client = options.stripeClient;
	const events = new Set([
		"charge.succeeded",
		"checkout.session.completed",
		"customer.subscription.updated",
		"customer.subscription.deleted",
		"invoice.payment_failed",
	]);

	return {
		id: "stripe",
		endpoints: {
			webhook: createAuthEndpoint(
				"/stripe/webhook",
				{
					method: "POST",
					requireHeaders: true,
				},
				async (ctx) => {
					if (!ctx.request) {
						throw new APIError("INTERNAL_SERVER_ERROR");
					}
					const buf = await ctx.request.text();
					const sig = ctx.headers.get("Stripe-Signature") as string;
					const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
					let event: Stripe.Event;
					try {
						if (!sig || !webhookSecret) return;
						event = client.webhooks.constructEvent(buf, sig, webhookSecret);
					} catch (err: any) {
						ctx.context.logger.error(`${err.message}`);
						throw new APIError("BAD_REQUEST", {
							message: `Webhook Error: ${err.message}`,
						});
					}
					if (!events.has(event.type)) {
						return ctx.json(null);
					}
					try {
						switch (event.type) {
							case "checkout.session.completed":
								await checkoutSessionCompleted(ctx.context, options, event);
								break;
						}
					} catch (e: any) {
						ctx.context.logger.error(
							`Stripe webhook failed. Error: ${e.message}`,
						);
						throw new APIError("BAD_REQUEST", {
							message: "Webhook error: See server logs for more information.",
						});
					}
					return ctx.json({ success: true });
				},
			),
			upgradeSubscription: createAuthEndpoint(
				"/subscription/upgrade",
				{
					method: "POST",
					body: z.object({
						plan: z.string(),
						period: z.string(),
					}),
					use: [sessionMiddleware],
				},
				async (ctx) => {},
			),
			getSubscriptionPlan: createAuthEndpoint(
				"/subscription/get-plan",
				{
					method: "GET",
					query: z.optional(
						z.object({
							referenceId: z.string(),
						}),
					),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const subscription = await ctx.context.adapter.findOne<Subscription>({
						model: "subscription",
						where: [
							{
								field: "referenceId",
								value: ctx.query?.referenceId || ctx.context.session.user.id,
							},
						],
					});
					if (!subscription) {
						throw new APIError("BAD_REQUEST", {
							message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
						});
					}
					const plan = options.subscription?.plans.find(
						(plan) => plan.name === subscription.plan,
					);
					if (!plan) {
						throw new APIError("BAD_REQUEST", {
							message: STRIPE_ERROR_CODES.SUBSCRIPTION_PLAN_NOT_FOUND,
						});
					}
					return ctx.json({
						...subscription,
						plan: plan,
					});
				},
			),
		},
	} satisfies BetterAuthPlugin;
};

const auth = betterAuth({
	plugins: [
		stripe({
			stripeClient: new Stripe(""),
			subscription: {
				enabled: true,
				plans: [
					{
						name: "free",
						type: "free",
					},
				],
			},
		}),
	],
});
