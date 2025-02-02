import {
	type AuthContext,
	type AuthPluginSchema,
	type BetterAuthPlugin,
	type Expand,
	type Session,
	type User,
} from "better-auth";
import { createAuthEndpoint } from "better-auth/plugins";
import Stripe from "stripe";
import { z } from "zod";
import { sessionMiddleware, APIError } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";

export const stripeClient = new Stripe(`${process.env.STRIPE_SECRET_KEY}`, {
	apiVersion: "2025-01-27.acacia",
	appInfo: {
		name: "Dub.co",
		version: "0.1.0",
	},
});

type Plan = {
	priceId?: string;
	name: string;
	limits?: Record<string, number>;
	group?: string;
};

export interface Subscription {
	id: string;
	plan: string;
	stripeCustomerId?: string;
	referenceId: string;
	priceId?: string;
	status:
		| "active"
		| "canceled"
		| "incomplete"
		| "incomplete_expired"
		| "past_due"
		| "paused"
		| "trialing"
		| "unpaid";
	group?: string;
	billingCycleStart: Date;
}

export interface InputSubscription extends Omit<Subscription, "id"> {}

export interface Customer {
	id: string;
	stripeCustomerId?: string;
	referenceId: string;
	name?: string;
	email?: string;
	country?: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface InputCustomer extends Omit<Customer, "id"> {}

async function getPlans(options: StripeOptions) {
	return typeof options.subscription?.plans === "function"
		? await options.subscription.plans()
		: options.subscription?.plans;
}

async function getPlanByPriceId(options: StripeOptions, priceId: string) {
	return await getPlans(options).then((res) =>
		res?.find((plan) => plan.priceId === priceId),
	);
}

async function getPlanByName(options: StripeOptions, name: string) {
	return await getPlans(options).then((res) =>
		res?.find((plan) => plan.name === name),
	);
}

const getSchema = (options: StripeOptions) => {
	const subscription = {
		subscription: {
			fields: {
				plan: {
					type: "string",
					required: true,
				},
				referenceId: {
					type: "string",
					required: true,
				},
				stripeCustomerId: {
					type: "string",
					required: false,
				},
				status: {
					type: "string",
					defaultValue: "incomplete",
				},
				billingCycleStart: {
					type: "date",
					required: false,
				},
				group: {
					type: "string",
					required: false,
				},
			},
		},
	} satisfies AuthPluginSchema;
	return {
		...(options.subscription?.enabled ? subscription : {}),
		customer: {
			fields: {
				stripeCustomerId: {
					type: "string",
					required: true,
				},
				referenceId: {
					type: "string",
					required: true,
				},
				name: {
					type: "string",
					required: false,
				},
				email: {
					type: "string",
					required: false,
				},
				country: {
					type: "string",
					required: false,
				},
				createdAt: {
					type: "date",
					required: true,
				},
				updatedAt: {
					type: "date",
					required: true,
				},
			},
		},
	} satisfies AuthPluginSchema;
};

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
		plans: Plan[] | (() => Promise<Plan[]>);
		/**
		 * Default plan to create subscription, when a user sign up.
		 */
		defaultPlan: string;
		/**
		 * parameters for session create params
		 *
		 * @param data - data containing user, session and subscription if enabled
		 * @param request - Request Object
		 */
		getCheckoutSessionParams?: (
			data: {
				user: User & Record<string, any>;
				session: Session & Record<string, any>;
				plan: Plan;
			},
			request?: Request,
		) =>
			| Promise<{
					params?: Stripe.Checkout.SessionCreateParams;
					options?: Stripe.RequestOptions;
			  }>
			| {
					params?: Stripe.Checkout.SessionCreateParams;
					options?: Stripe.RequestOptions;
			  };
	};
	onCheckoutSessionComplete?: (
		event: Stripe.Event,
		subscription?: Subscription | null,
	) => Promise<void>;
	onEvent?: (event: Stripe.Event) => Promise<void>;
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
		const plan = await getPlanByPriceId(options, priceId as string);
		if (plan) {
			const referenceId = checkoutSession?.metadata?.referenceId;
			const subscriptionId = checkoutSession?.metadata?.subscriptionId;
			if (referenceId && subscriptionId) {
				let dbSubscription = await ctx.adapter.update<InputSubscription>({
					model: "subscription",
					update: {
						status: subscription.status,
						updatedAt: new Date(),
						billingCycleStart: new Date(
							subscription.current_period_start * 1000,
						),
					},
					where: [
						{
							field: "referenceId",
							value: referenceId,
						},
					],
				});
				if (!dbSubscription) {
					dbSubscription = await ctx.adapter.findOne<Subscription>({
						model: "subscription",
						where: [
							{
								field: "id",
								value: subscriptionId,
							},
						],
					});
				}
				await options.onCheckoutSessionComplete?.(
					event,
					dbSubscription as Subscription,
				);
				return;
			}
		}
	}
	await options.onCheckoutSessionComplete?.(event);
}

const STRIPE_ERROR_CODES = {
	SUBSCRIPTION_NOT_FOUND: "Subscription not found",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Subscription plan not found",
	ALREADY_SUBSCRIBED_PLAN: "You're already subscribed to this plan",
	UNABLE_TO_CREATE_CUSTOMER: "Unable to create customer",
	FAILED_TO_FETCH_PLANS: "Failed to fetch plans",
} as const;

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
			stripeWebhook: createAuthEndpoint(
				"/stripe/webhook",
				{
					method: "POST",
					metadata: {
						isAction: false,
					},
					cloneRequest: true,
				},
				async (ctx) => {
					if (!ctx.request) {
						throw new APIError("INTERNAL_SERVER_ERROR");
					}
					const buf = await ctx.request.text();
					const sig = ctx.request.headers.get("Stripe-Signature") as string;
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
							default:
								await options.onEvent?.(event);
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
						referenceId: z.string().optional(),
						metadata: z.record(z.string(), z.any()).optional(),
					}),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const { user, session } = ctx.context.session;
					const referenceId =
						ctx.body.referenceId || ctx.context.session.user.id;
					const plan = await getPlanByName(options, ctx.body.plan);
					console.log({ plan, planF: ctx.body.plan });
					if (!plan) {
						throw new APIError("BAD_REQUEST", {
							message: STRIPE_ERROR_CODES.SUBSCRIPTION_PLAN_NOT_FOUND,
						});
					}
					let customer = await ctx.context.adapter.findOne<Customer>({
						model: "customer",
						where: [
							{
								field: "referenceId",
								value: referenceId,
							},
						],
					});
					if (!customer) {
						try {
							const stripeCustomer = await client.customers.create(
								{
									email: user.email,
									name: user.name,
									metadata: {
										...ctx.body.metadata,
										referenceId,
										userId: user.id,
									},
								},
								{
									idempotencyKey: generateRandomString(32, "a-z", "0-9"),
								},
							);
							customer = await ctx.context.adapter.create<
								InputCustomer,
								Customer
							>({
								model: "customer",
								data: {
									referenceId,
									stripeCustomerId: stripeCustomer.id,
									createdAt: new Date(),
									updatedAt: new Date(),
								},
							});
						} catch (e: any) {
							ctx.context.logger.error(e);
							throw new APIError("BAD_REQUEST", {
								message: STRIPE_ERROR_CODES.UNABLE_TO_CREATE_CUSTOMER,
							});
						}
					}
					const subscriptions =
						await ctx.context.adapter.findMany<Subscription>({
							model: "subscription",
							where: [
								{
									field: "referenceId",
									value: referenceId,
								},
							],
						});
					const hasSubscription = subscriptions.some(
						(sub) => sub.plan === plan.name && sub.status === "active",
					);
					if (hasSubscription) {
						throw new APIError("BAD_REQUEST", {
							message: STRIPE_ERROR_CODES.ALREADY_SUBSCRIBED_PLAN,
						});
					}
					const existingSubscription = subscriptions.find(
						(sub) => sub.plan === plan.name,
					);
					let subscriptionId = existingSubscription?.id;
					if (!existingSubscription) {
						const newSubscription = await ctx.context.adapter.create<
							InputSubscription,
							Subscription
						>({
							model: "subscription",
							data: {
								plan: plan.name,
								stripeCustomerId: customer.stripeCustomerId as string,
								status: "incomplete",
								referenceId,
								billingCycleStart: new Date(),
							},
						});
						subscriptionId = newSubscription.id;
					} else {
						await ctx.context.adapter.update<InputSubscription>({
							model: "subscription",
							update: {
								status: "incomplete",
							},
							where: [
								{
									field: "id",
									value: existingSubscription?.id,
								},
							],
						});
					}

					if (!subscriptionId) {
						ctx.context.logger.error("Subscription ID not found");
						throw new APIError("INTERNAL_SERVER_ERROR");
					}

					const params = await options.subscription?.getCheckoutSessionParams?.(
						{
							user,
							session,
							plan,
						},
						ctx.request,
					);
					const checkoutSession = await client.checkout.sessions.create(
						{
							line_items: [
								{
									price: plan.priceId,
									quantity: 1,
								},
							],
							customer_email: user.email,
							mode: "subscription",
							success_url: `${ctx.context.options.baseURL}`,
							cancel_url: `${ctx.context.options.baseURL}/cancel`,
							...params?.options,
							metadata: {
								referenceId,
								subscriptionId,
								...params?.params?.metadata,
							},
						},
						params?.options,
					);
					return ctx.json(checkoutSession);
				},
			),
			listSubscriptions: createAuthEndpoint(
				"/subscription/list",
				{
					method: "GET",
					query: z.optional(
						z.object({
							referenceId: z.string().optional(),
						}),
					),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const subscriptions =
						await ctx.context.adapter.findMany<Subscription>({
							model: "subscription",
							where: [
								{
									field: "referenceId",
									value: ctx.query?.referenceId || ctx.context.session.user.id,
								},
							],
						});
					if (!subscriptions.length) {
						throw new APIError("BAD_REQUEST", {
							message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
						});
					}
					const plans = await getPlans(options);
					if (!plans) {
						throw new APIError("BAD_REQUEST", {
							message: STRIPE_ERROR_CODES.FAILED_TO_FETCH_PLANS,
						});
					}
					const subs = subscriptions.map((sub) => {
						const plan = plans.find((p) => p.name === sub.plan);
						return {
							...sub,
							plan: plan?.name,
							limits: plan?.limits,
						};
					});
					return ctx.json(subs);
				},
			),
		},
		schema: getSchema(options),
	} satisfies BetterAuthPlugin;
};
