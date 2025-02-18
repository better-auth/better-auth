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
import { custom, z } from "zod";
import { sessionMiddleware, APIError, originCheck } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";

export const stripeClient = new Stripe(`${process.env.STRIPE_SECRET_KEY}`, {
	apiVersion: "2025-01-27.acacia",
	appInfo: {
		name: "Dub.co",
		version: "0.1.0",
	},
});

type Plan = {
	/**
	 * Monthly price id
	 */
	priceId?: string;
	/**
	 * To use lookup key instead of price id
	 *
	 * https://docs.stripe.com/products-prices/
	 * manage-prices#lookup-keys
	 */
	lookupKey?: string;
	/**
	 * A yearly discount price id
	 *
	 * useful when you want to offer a discount for
	 * yearly subscription
	 */
	annualDiscountPriceId?: string;
	/**
	 * Plan name
	 */
	name: string;
	/**
	 * Limits for the plan
	 */
	limits?: Record<string, number>;
	/**
	 * Plan group name
	 *
	 * useful when you want to group plans or
	 * when a user can subscribe to multiple plans.
	 */
	group?: string;
	/**
	 * Free trial days
	 */
	freeTrial?: {
		/**
		 * Number of days
		 */
		days: number;
		/**
		 * Only available for new users or users without existing subscription
		 *
		 * @default true
		 */
		forNewUsersOnly?: boolean;
		/**
		 * A function that will be called when the trial
		 * starts.
		 *
		 * @param subscription
		 * @returns
		 */
		onTrialStart?: (subscription: Subscription) => Promise<void>;
		/**
		 * A function that will be called when the trial
		 * ends
		 *
		 * @param subscription - Subscription
		 * @returns
		 */
		onTrialEnd?: (
			data: {
				subscription: Subscription;
				user: User & Record<string, any>;
			},
			request?: Request,
		) => Promise<void>;
		/**
		 * A function that will be called when the trial
		 * expired.
		 * @param subscription - Subscription
		 * @returns
		 */
		onTrialExpired?: (subscription: Subscription) => Promise<void>;
	};
};

export interface Subscription {
	/**
	 * Database identifier
	 */
	id: string;
	/**
	 * The plan name
	 */
	plan: string;
	/**
	 * Stripe customer id
	 */
	stripeCustomerId?: string;
	/**
	 * Stripe subscription id
	 */
	stripeSubscriptionId?: string;
	/**
	 * Trial start date
	 */
	trialStart?: Date;
	/**
	 * Trial end date
	 */
	trialEnd?: Date;
	/**
	 * Price Id for the subscription
	 */
	priceId?: string;
	/**
	 * The user who subscribed to the plan
	 */
	userId: string;
	/**
	 * To what reference id the subscription belongs to
	 * @example
	 * - workspace id for a saas platform
	 * - website id for a hosting platform
	 *
	 * @default - userId
	 */
	referenceId: string;
	/**
	 * Subscription status
	 */
	status:
		| "active"
		| "canceled"
		| "incomplete"
		| "incomplete_expired"
		| "past_due"
		| "paused"
		| "trialing"
		| "unpaid";
	/**
	 * The billing cycle start date
	 */
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
	return typeof options?.plans === "function"
		? await options.plans()
		: options?.plans;
}

async function getPlanByPriceId(options: StripeOptions, priceId: string) {
	return await getPlans(options).then((res) =>
		res?.find((plan) => plan.priceId === priceId),
	);
}

async function getPlanByName(options: StripeOptions, name: string) {
	return await getPlans(options).then((res) =>
		res?.find((plan) => plan.name.toLowerCase() === name.toLowerCase()),
	);
}

const getSchema = () => {
	return {
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
				userId: {
					type: "string",
					references: {
						model: "user",
						field: "id",
					},
				},
			},
		},
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
	 * Stripe Webhook Secret
	 *
	 * @description Stripe webhook secret key
	 */
	stripeWebhookSecret: string;
	/**
	 * Subscription Configuration
	 */
	/**
	 * List of plan
	 */
	plans: Plan[] | (() => Promise<Plan[]>);
	/**
	 * Default plan to create subscription, when a user sign up.
	 */
	defaultPlan?: string;
	/**
	 * Require email verification before a user is allowed to upgrade
	 * their subscriptions
	 *
	 * @default false
	 */
	requireEmailVerification?: boolean;
	/**
	 * parameters for session create params
	 *
	 * @param data - data containing user, session and plan
	 * @param request - Request Object
	 */
	getCheckoutSessionParams?: (
		data: {
			user: User & Record<string, any>;
			session: Session & Record<string, any>;
			plan: Plan;
			subscription: Subscription;
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

	checkout?: {
		/**
		 * Enable checkout flow
		 *
		 * @default true
		 */
		enabled?: boolean;
	};
	taxCollection?: {
		/**
		 * Enable tax calculation
		 *
		 * @default false
		 */
		enabled?: boolean;
		/**
		 * Tax calculation options
		 */
		options?: Stripe.TaxRateCreateParams;
	};
	/**
	 * A callback to run after a user has subscribed to a package
	 * @param event - Stripe Event
	 * @param subscription - Subscription Data
	 * @returns
	 */
	onSubscriptionComplete?: (
		data: {
			event: Stripe.Event;
			subscription: Subscription;
			plan: Plan;
		},
		request?: Request,
	) => Promise<void>;
	onEvent?: (event: Stripe.Event) => Promise<void>;
	/**
	 * A function to check if the reference id is valid
	 * and belongs to the user
	 *
	 * @param data - data containing user, session and referenceId
	 * @param request - Request Object
	 * @returns
	 */
	authorizeReference?: (
		data: {
			user: User & Record<string, any>;
			session: Session & Record<string, any>;
			referenceId: string;
			action: "upgrade" | "list";
		},
		request?: Request,
	) => Promise<boolean>;
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
	const subscription = await client.subscriptions.retrieve(
		checkoutSession.subscription as string,
	);
	const priceId = subscription.items.data[0]?.price.id;
	const plan = await getPlanByPriceId(options, priceId as string);
	if (plan) {
		const referenceId = checkoutSession?.metadata?.referenceId;
		const subscriptionId = checkoutSession?.metadata?.subscriptionId;
		if (referenceId && subscriptionId) {
			const trial =
				subscription.trial_start && subscription.trial_end
					? {
							trialStart: new Date(subscription.trial_start * 1000),
							trialEnd: new Date(subscription.trial_end * 1000),
						}
					: {};
			let dbSubscription = await ctx.adapter.update<InputSubscription>({
				model: "subscription",
				update: {
					plan: plan.name.toLowerCase(),
					status: subscription.status,
					updatedAt: new Date(),
					billingCycleStart: new Date(subscription.current_period_start * 1000),
					...trial,
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
			await options.onSubscriptionComplete?.({
				event,
				subscription: dbSubscription as Subscription,
				plan,
			});
			return;
		}
	}
}

const STRIPE_ERROR_CODES = {
	SUBSCRIPTION_NOT_FOUND: "Subscription not found",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Subscription plan not found",
	ALREADY_SUBSCRIBED_PLAN: "You're already subscribed to this plan",
	UNABLE_TO_CREATE_CUSTOMER: "Unable to create customer",
	FAILED_TO_FETCH_PLANS: "Failed to fetch plans",
	EMAIL_VERIFICATION_REQUIRED:
		"Email verification is required before you can subscribe to a plan",
} as const;

export const stripe = <O extends StripeOptions>(options: Expand<O>) => {
	const client = options.stripeClient;
	const events = new Set([
		"charge.succeeded",
		"checkout.session.completed",
		"customer.updated",
		"customer.deleted",
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
					if (!ctx.request?.body) {
						throw new APIError("INTERNAL_SERVER_ERROR");
					}
					const buf = await ctx.request.text();
					const sig = ctx.request.headers.get("stripe-signature") as string;
					const webhookSecret = options.stripeWebhookSecret;
					let event: Stripe.Event;
					try {
						if (!sig || !webhookSecret) {
							throw new APIError("BAD_REQUEST", {
								message: "Stripe webhook secret not found",
							});
						}
						event = client.webhooks.constructEvent(buf, sig, webhookSecret);
					} catch (err: any) {
						ctx.context.logger.error(`${err.message}`);
						throw new APIError("BAD_REQUEST", {
							message: `Webhook Error: ${err.message}`,
						});
					}
					try {
						switch (event.type) {
							case "checkout.session.completed":
								await checkoutSessionCompleted(ctx.context, options, event);
								await options.onEvent?.(event);
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
						uiMode: z.enum(["embedded", "hosted"]).default("hosted"),
						successUrl: z
							.string({
								description:
									"callback url to redirect back after successful subscription",
							})
							.default("/"),
						cancelUrl: z
							.string({
								description:
									"callback url to redirect back after successful subscription",
							})
							.default("/"),
						returnUrl: z.string().optional(),
						withoutTrial: z.boolean().optional(),
						disableRedirect: z.boolean().default(false),
					}),
					use: [
						sessionMiddleware,
						originCheck((c) => {
							return [c.body.successURL, c.body.cancelURL];
						}),
					],
				},
				async (ctx) => {
					const { user, session } = ctx.context.session;
					if (!user.emailVerified && options.requireEmailVerification) {
						throw new APIError("BAD_REQUEST", {
							message: STRIPE_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED,
						});
					}
					const referenceId = ctx.body.referenceId || user.id;
					/**
					 * Check if the user is authorized to upgrade the subscription
					 * for the reference id
					 */
					const isAuthorized = ctx.body.referenceId
						? await options.authorizeReference?.({
								user,
								session,
								referenceId,
								action: "upgrade",
							})
						: true;
					if (!isAuthorized) {
						throw new APIError("UNAUTHORIZED", {
							message: "Unauthorized",
						});
					}
					const plan = await getPlanByName(options, ctx.body.plan);
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
					const activeSubscription = customer.stripeCustomerId
						? await client.subscriptions
								.list({
									customer: customer.stripeCustomerId,
									status: "active",
								})
								.then((res) => res.data[0])
						: null;
					if (activeSubscription) {
					}
					const getUrl = (url: string) => {
						if (url.startsWith("http")) {
							return url;
						}
						return `${ctx.context.options.baseURL}${
							url.startsWith("/") ? url : `/${url}`
						}`;
					};

					const subscriptions =
						await ctx.context.adapter.findMany<Subscription>({
							model: "subscription",
							where: [
								{
									field: "userId",
									value: user.id,
								},
							],
						});
					const existingSubscription = subscriptions.find(
						(sub) =>
							(sub.status === "active" || sub.status === "trialing") &&
							sub.referenceId === referenceId,
					);
					if (
						existingSubscription &&
						existingSubscription.status === "active" &&
						existingSubscription.plan === ctx.body.plan
					) {
						throw new APIError("BAD_REQUEST", {
							message: STRIPE_ERROR_CODES.ALREADY_SUBSCRIBED_PLAN,
						});
					}
					let subscription = existingSubscription;
					if (!subscription) {
						const newSubscription = await ctx.context.adapter.create<
							InputSubscription,
							Subscription
						>({
							model: "subscription",
							data: {
								plan: plan.name.toLowerCase(),
								stripeCustomerId: customer.stripeCustomerId as string,
								status: "incomplete",
								referenceId,
								userId: user.id,
								billingCycleStart: new Date(),
							},
						});
						subscription = newSubscription;
					}

					if (!subscription) {
						ctx.context.logger.error("Subscription ID not found");
						throw new APIError("INTERNAL_SERVER_ERROR");
					}

					const params = await options?.getCheckoutSessionParams?.(
						{
							user,
							session,
							plan,
							subscription,
						},
						ctx.request,
					);

					const checkoutSession = await client.checkout.sessions.create({
						...(customer.stripeCustomerId
							? {
									customer: customer.stripeCustomerId,
									customer_update: {
										name: "auto",
										address: "auto",
									},
								}
							: {
									customer_email: session.user.email,
								}),
						billing_address_collection: "required",
						success_url: getUrl(ctx.body.successUrl),
						cancel_url: getUrl(ctx.body.cancelUrl),
						line_items: [{ price: plan.priceId, quantity: 1 }],
						mode: "subscription",
						client_reference_id: referenceId,
						metadata: {
							userId: user.id,
							subscriptionId: subscription.id,
						},
					});
					return ctx.json({
						...checkoutSession,
						redirect: !ctx.body.disableRedirect,
					});
				},
			),
			listActiveSubscriptions: createAuthEndpoint(
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
						return [];
					}
					const plans = await getPlans(options);
					if (!plans) {
						return [];
					}
					const subs = subscriptions
						.map((sub) => {
							const plan = plans.find(
								(p) => p.name.toLowerCase() === sub.plan.toLowerCase(),
							);
							return {
								...sub,
								limits: plan?.limits,
							};
						})
						.filter((sub) => {
							return sub.status === "active" || sub.status === "trialing";
						});
					return ctx.json(subs);
				},
			),
		},
		schema: getSchema(),
	} satisfies BetterAuthPlugin;
};
