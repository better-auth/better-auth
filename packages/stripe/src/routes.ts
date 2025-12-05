import { createAuthEndpoint } from "@better-auth/core/api";
import { defineErrorCodes } from "@better-auth/core/utils";
import type { GenericEndpointContext } from "better-auth";
import {
	APIError,
	getSessionFromCtx,
	originCheck,
	sessionMiddleware,
} from "better-auth/api";
import type Stripe from "stripe";
import type { Stripe as StripeType } from "stripe";
import * as z from "zod/v4";
import {
	onCheckoutSessionCompleted,
	onSubscriptionDeleted,
	onSubscriptionUpdated,
} from "./hooks";
import { referenceMiddleware } from "./middleware";
import type {
	InputSubscription,
	StripeOptions,
	Subscription,
	SubscriptionOptions,
} from "./types";
import { getPlanByName, getPlanByPriceInfo, getPlans } from "./utils";

const STRIPE_ERROR_CODES = defineErrorCodes({
	SUBSCRIPTION_NOT_FOUND: "Subscription not found",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Subscription plan not found",
	ALREADY_SUBSCRIBED_PLAN: "You're already subscribed to this plan",
	UNABLE_TO_CREATE_CUSTOMER: "Unable to create customer",
	FAILED_TO_FETCH_PLANS: "Failed to fetch plans",
	EMAIL_VERIFICATION_REQUIRED:
		"Email verification is required before you can subscribe to a plan",
	SUBSCRIPTION_NOT_ACTIVE: "Subscription is not active",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"Subscription is not scheduled for cancellation",
});

const upgradeSubscriptionBodySchema = z.object({
	/**
	 * The name of the plan to subscribe
	 */
	plan: z.string().meta({
		description: 'The name of the plan to upgrade to. Eg: "pro"',
	}),
	/**
	 * If annual plan should be applied.
	 */
	annual: z
		.boolean()
		.meta({
			description: "Whether to upgrade to an annual plan. Eg: true",
		})
		.optional(),
	/**
	 * Reference id of the subscription to upgrade
	 * This is used to identify the subscription to upgrade
	 * If not provided, the user's id will be used
	 */
	referenceId: z
		.string()
		.meta({
			description: 'Reference id of the subscription to upgrade. Eg: "123"',
		})
		.optional(),
	/**
	 * This is to allow a specific subscription to be upgrade.
	 * If subscription id is provided, and subscription isn't found,
	 * it'll throw an error.
	 */
	subscriptionId: z
		.string()
		.meta({
			description: 'The id of the subscription to upgrade. Eg: "sub_123"',
		})
		.optional(),
	/**
	 * Any additional data you want to store in your database
	 * subscriptions
	 */
	metadata: z.record(z.string(), z.any()).optional(),
	/**
	 * If a subscription
	 */
	seats: z
		.number()
		.meta({
			description: "Number of seats to upgrade to (if applicable). Eg: 1",
		})
		.optional(),
	/**
	 * Success URL to redirect back after successful subscription
	 */
	successUrl: z
		.string()
		.meta({
			description:
				'Callback URL to redirect back after successful subscription. Eg: "https://example.com/success"',
		})
		.default("/"),
	/**
	 * Cancel URL
	 */
	cancelUrl: z
		.string()
		.meta({
			description:
				'If set, checkout shows a back button and customers will be directed here if they cancel payment. Eg: "https://example.com/pricing"',
		})
		.default("/"),
	/**
	 * Return URL
	 */
	returnUrl: z
		.string()
		.meta({
			description:
				'URL to take customers to when they click on the billing portal’s link to return to your website. Eg: "https://example.com/dashboard"',
		})
		.optional(),
	/**
	 * Disable Redirect
	 */
	disableRedirect: z
		.boolean()
		.meta({
			description: "Disable redirect after successful subscription. Eg: true",
		})
		.default(false),
});

/**
 * ### Endpoint
 *
 * POST `/subscription/upgrade`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.upgradeSubscription`
 *
 * **client:**
 * `authClient.subscription.upgrade`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/stripe#api-method-subscription-upgrade)
 */
export const upgradeSubscription = (options: StripeOptions) => {
	const client = options.stripeClient;
	const subscriptionOptions = options.subscription as SubscriptionOptions;

	return createAuthEndpoint(
		"/subscription/upgrade",
		{
			method: "POST",
			body: upgradeSubscriptionBodySchema,
			metadata: {
				openapi: {
					operationId: "upgradeSubscription",
				},
			},
			use: [
				sessionMiddleware,
				originCheck((c) => {
					return [c.body.successUrl as string, c.body.cancelUrl as string];
				}),
				referenceMiddleware(subscriptionOptions, "upgrade-subscription"),
			],
		},
		async (ctx) => {
			const { user, session } = ctx.context.session;
			if (!user.emailVerified && subscriptionOptions.requireEmailVerification) {
				throw new APIError("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED,
				});
			}
			const referenceId = ctx.body.referenceId || user.id;
			const plan = await getPlanByName(options, ctx.body.plan);
			if (!plan) {
				throw new APIError("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.SUBSCRIPTION_PLAN_NOT_FOUND,
				});
			}
			const subscriptionToUpdate = ctx.body.subscriptionId
				? await ctx.context.adapter.findOne<Subscription>({
						model: "subscription",
						where: [
							{
								field: "id",
								value: ctx.body.subscriptionId,
								connector: "OR",
							},
							{
								field: "stripeSubscriptionId",
								value: ctx.body.subscriptionId,
								connector: "OR",
							},
						],
					})
				: referenceId
					? await ctx.context.adapter.findOne<Subscription>({
							model: "subscription",
							where: [{ field: "referenceId", value: referenceId }],
						})
					: null;

			if (ctx.body.subscriptionId && !subscriptionToUpdate) {
				throw new APIError("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
				});
			}

			let customerId =
				subscriptionToUpdate?.stripeCustomerId || user.stripeCustomerId;

			if (!customerId) {
				try {
					// Try to find existing Stripe customer by email
					const existingCustomers = await client.customers.list({
						email: user.email,
						limit: 1,
					});

					let stripeCustomer = existingCustomers.data[0];

					if (!stripeCustomer) {
						stripeCustomer = await client.customers.create({
							email: user.email,
							name: user.name,
							metadata: {
								...ctx.body.metadata,
								userId: user.id,
							},
						});
					}

					// Update local DB with Stripe customer ID
					await ctx.context.adapter.update({
						model: "user",
						update: {
							stripeCustomerId: stripeCustomer.id,
						},
						where: [
							{
								field: "id",
								value: user.id,
							},
						],
					});

					customerId = stripeCustomer.id;
				} catch (e: any) {
					ctx.context.logger.error(e);
					throw new APIError("BAD_REQUEST", {
						message: STRIPE_ERROR_CODES.UNABLE_TO_CREATE_CUSTOMER,
					});
				}
			}

			const subscriptions = subscriptionToUpdate
				? [subscriptionToUpdate]
				: await ctx.context.adapter.findMany<Subscription>({
						model: "subscription",
						where: [
							{
								field: "referenceId",
								value: ctx.body.referenceId || user.id,
							},
						],
					});

			const activeOrTrialingSubscription = subscriptions.find(
				(sub) => sub.status === "active" || sub.status === "trialing",
			);

			const activeSubscriptions = await client.subscriptions
				.list({
					customer: customerId,
				})
				.then((res) =>
					res.data.filter(
						(sub) => sub.status === "active" || sub.status === "trialing",
					),
				);

			const activeSubscription = activeSubscriptions.find((sub) => {
				// If we have a specific subscription to update, match by ID
				if (
					subscriptionToUpdate?.stripeSubscriptionId ||
					ctx.body.subscriptionId
				) {
					return (
						sub.id === subscriptionToUpdate?.stripeSubscriptionId ||
						sub.id === ctx.body.subscriptionId
					);
				}
				// Only find subscription for the same referenceId to avoid mixing personal and org subscriptions
				if (activeOrTrialingSubscription?.stripeSubscriptionId) {
					return sub.id === activeOrTrialingSubscription.stripeSubscriptionId;
				}
				return false;
			});

			// Also find any incomplete subscription that we can reuse
			const incompleteSubscription = subscriptions.find(
				(sub) => sub.status === "incomplete",
			);

			if (
				activeOrTrialingSubscription &&
				activeOrTrialingSubscription.status === "active" &&
				activeOrTrialingSubscription.plan === ctx.body.plan &&
				activeOrTrialingSubscription.seats === (ctx.body.seats || 1)
			) {
				throw new APIError("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.ALREADY_SUBSCRIBED_PLAN,
				});
			}

			if (activeSubscription && customerId) {
				// Find the corresponding database subscription for this Stripe subscription
				let dbSubscription = await ctx.context.adapter.findOne<Subscription>({
					model: "subscription",
					where: [
						{
							field: "stripeSubscriptionId",
							value: activeSubscription.id,
						},
					],
				});

				// If no database record exists for this Stripe subscription, update the existing one
				if (!dbSubscription && activeOrTrialingSubscription) {
					await ctx.context.adapter.update<InputSubscription>({
						model: "subscription",
						update: {
							stripeSubscriptionId: activeSubscription.id,
							updatedAt: new Date(),
						},
						where: [
							{
								field: "id",
								value: activeOrTrialingSubscription.id,
							},
						],
					});
					dbSubscription = activeOrTrialingSubscription;
				}

				// Resolve price ID if using lookup keys
				let priceIdToUse: string | undefined = undefined;
				if (ctx.body.annual) {
					priceIdToUse = plan.annualDiscountPriceId;
					if (!priceIdToUse && plan.annualDiscountLookupKey) {
						priceIdToUse = await resolvePriceIdFromLookupKey(
							client,
							plan.annualDiscountLookupKey,
						);
					}
				} else {
					priceIdToUse = plan.priceId;
					if (!priceIdToUse && plan.lookupKey) {
						priceIdToUse = await resolvePriceIdFromLookupKey(
							client,
							plan.lookupKey,
						);
					}
				}

				if (!priceIdToUse) {
					throw ctx.error("BAD_REQUEST", {
						message: "Price ID not found for the selected plan",
					});
				}

				const { url } = await client.billingPortal.sessions
					.create({
						customer: customerId,
						return_url: getUrl(ctx, ctx.body.returnUrl || "/"),
						flow_data: {
							type: "subscription_update_confirm",
							after_completion: {
								type: "redirect",
								redirect: {
									return_url: getUrl(ctx, ctx.body.returnUrl || "/"),
								},
							},
							subscription_update_confirm: {
								subscription: activeSubscription.id,
								items: [
									{
										id: activeSubscription.items.data[0]?.id as string,
										quantity: ctx.body.seats || 1,
										price: priceIdToUse,
									},
								],
							},
						},
					})
					.catch(async (e) => {
						throw ctx.error("BAD_REQUEST", {
							message: e.message,
							code: e.code,
						});
					});
				return ctx.json({
					url,
					redirect: true,
				});
			}

			let subscription: Subscription | undefined =
				activeOrTrialingSubscription || incompleteSubscription;

			if (incompleteSubscription && !activeOrTrialingSubscription) {
				const updated = await ctx.context.adapter.update<InputSubscription>({
					model: "subscription",
					update: {
						plan: plan.name.toLowerCase(),
						seats: ctx.body.seats || 1,
						updatedAt: new Date(),
					},
					where: [
						{
							field: "id",
							value: incompleteSubscription.id,
						},
					],
				});
				subscription = (updated as Subscription) || incompleteSubscription;
			}

			if (!subscription) {
				subscription = await ctx.context.adapter.create<
					InputSubscription,
					Subscription
				>({
					model: "subscription",
					data: {
						plan: plan.name.toLowerCase(),
						stripeCustomerId: customerId,
						status: "incomplete",
						referenceId,
						seats: ctx.body.seats || 1,
					},
				});
			}

			if (!subscription) {
				ctx.context.logger.error("Subscription ID not found");
				throw new APIError("INTERNAL_SERVER_ERROR");
			}

			const params = await subscriptionOptions.getCheckoutSessionParams?.(
				{
					user,
					session,
					plan,
					subscription,
				},
				ctx.request,
				ctx,
			);

			const hasEverTrialed = subscriptions.some((s) => {
				// Check if user has ever had a trial for any plan (not just the same plan)
				// This prevents users from getting multiple trials by switching plans
				const hadTrial =
					!!(s.trialStart || s.trialEnd) || s.status === "trialing";
				return hadTrial;
			});

			const freeTrial =
				!hasEverTrialed && plan.freeTrial
					? { trial_period_days: plan.freeTrial.days }
					: undefined;

			let priceIdToUse: string | undefined = undefined;
			if (ctx.body.annual) {
				priceIdToUse = plan.annualDiscountPriceId;
				if (!priceIdToUse && plan.annualDiscountLookupKey) {
					priceIdToUse = await resolvePriceIdFromLookupKey(
						client,
						plan.annualDiscountLookupKey,
					);
				}
			} else {
				priceIdToUse = plan.priceId;
				if (!priceIdToUse && plan.lookupKey) {
					priceIdToUse = await resolvePriceIdFromLookupKey(
						client,
						plan.lookupKey,
					);
				}
			}
			const checkoutSession = await client.checkout.sessions
				.create(
					{
						...(customerId
							? {
									customer: customerId,
									customer_update: {
										name: "auto",
										address: "auto",
									},
								}
							: {
									customer_email: session.user.email,
								}),
						success_url: getUrl(
							ctx,
							`${
								ctx.context.baseURL
							}/subscription/success?callbackURL=${encodeURIComponent(
								ctx.body.successUrl,
							)}&subscriptionId=${encodeURIComponent(subscription.id)}`,
						),
						cancel_url: getUrl(ctx, ctx.body.cancelUrl),
						line_items: [
							{
								price: priceIdToUse,
								quantity: ctx.body.seats || 1,
							},
						],
						subscription_data: {
							...freeTrial,
						},
						mode: "subscription",
						client_reference_id: referenceId,
						...params?.params,
						metadata: {
							userId: user.id,
							subscriptionId: subscription.id,
							referenceId,
							...params?.params?.metadata,
						},
					},
					params?.options,
				)
				.catch(async (e) => {
					throw ctx.error("BAD_REQUEST", {
						message: e.message,
						code: e.code,
					});
				});
			return ctx.json({
				...checkoutSession,
				redirect: !ctx.body.disableRedirect,
			});
		},
	);
};

const cancelSubscriptionCallbackQuerySchema = z
	.record(z.string(), z.any())
	.optional();

export const cancelSubscriptionCallback = (options: StripeOptions) => {
	const client = options.stripeClient;
	const subscriptionOptions = options.subscription as SubscriptionOptions;
	return createAuthEndpoint(
		"/subscription/cancel/callback",
		{
			method: "GET",
			query: cancelSubscriptionCallbackQuerySchema,
			metadata: {
				openapi: {
					operationId: "cancelSubscriptionCallback",
				},
			},
			use: [originCheck((ctx) => ctx.query.callbackURL)],
		},
		async (ctx) => {
			if (!ctx.query || !ctx.query.callbackURL || !ctx.query.subscriptionId) {
				throw ctx.redirect(getUrl(ctx, ctx.query?.callbackURL || "/"));
			}
			const session = await getSessionFromCtx<{ stripeCustomerId: string }>(
				ctx,
			);
			if (!session) {
				throw ctx.redirect(getUrl(ctx, ctx.query?.callbackURL || "/"));
			}
			const { user } = session;
			const { callbackURL, subscriptionId } = ctx.query;

			if (user?.stripeCustomerId) {
				try {
					const subscription = await ctx.context.adapter.findOne<Subscription>({
						model: "subscription",
						where: [
							{
								field: "id",
								value: subscriptionId,
							},
						],
					});
					if (
						!subscription ||
						subscription.cancelAtPeriodEnd ||
						subscription.status === "canceled"
					) {
						throw ctx.redirect(getUrl(ctx, callbackURL));
					}

					const stripeSubscription = await client.subscriptions.list({
						customer: user.stripeCustomerId,
						status: "active",
					});
					const currentSubscription = stripeSubscription.data.find(
						(sub) => sub.id === subscription.stripeSubscriptionId,
					);
					if (currentSubscription?.cancel_at_period_end === true) {
						await ctx.context.adapter.update({
							model: "subscription",
							update: {
								status: currentSubscription?.status,
								cancelAtPeriodEnd: true,
							},
							where: [
								{
									field: "id",
									value: subscription.id,
								},
							],
						});
						await subscriptionOptions.onSubscriptionCancel?.({
							subscription,
							cancellationDetails: currentSubscription.cancellation_details,
							stripeSubscription: currentSubscription,
							event: undefined,
						});
					}
				} catch (error) {
					ctx.context.logger.error(
						"Error checking subscription status from Stripe",
						error,
					);
				}
			}
			throw ctx.redirect(getUrl(ctx, callbackURL));
		},
	);
};

const cancelSubscriptionBodySchema = z.object({
	referenceId: z
		.string()
		.meta({
			description: "Reference id of the subscription to cancel. Eg: '123'",
		})
		.optional(),
	subscriptionId: z
		.string()
		.meta({
			description: "The id of the subscription to cancel. Eg: 'sub_123'",
		})
		.optional(),
	returnUrl: z.string().meta({
		description:
			'URL to take customers to when they click on the billing portal\'s link to return to your website. Eg: "/account"',
	}),
});

/**
 * ### Endpoint
 *
 * POST `/subscription/cancel`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.cancelSubscription`
 *
 * **client:**
 * `authClient.subscription.cancel`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/stripe#api-method-subscription-cancel)
 */
export const cancelSubscription = (options: StripeOptions) => {
	const client = options.stripeClient;
	const subscriptionOptions = options.subscription as SubscriptionOptions;
	return createAuthEndpoint(
		"/subscription/cancel",
		{
			method: "POST",
			body: cancelSubscriptionBodySchema,
			metadata: {
				openapi: {
					operationId: "cancelSubscription",
				},
			},
			use: [
				sessionMiddleware,
				originCheck((ctx) => ctx.body.returnUrl),
				referenceMiddleware(subscriptionOptions, "cancel-subscription"),
			],
		},
		async (ctx) => {
			const referenceId = ctx.body?.referenceId || ctx.context.session.user.id;
			const subscription = ctx.body.subscriptionId
				? await ctx.context.adapter.findOne<Subscription>({
						model: "subscription",
						where: [
							{
								field: "id",
								value: ctx.body.subscriptionId,
							},
						],
					})
				: await ctx.context.adapter
						.findMany<Subscription>({
							model: "subscription",
							where: [{ field: "referenceId", value: referenceId }],
						})
						.then((subs) =>
							subs.find(
								(sub) => sub.status === "active" || sub.status === "trialing",
							),
						);

			if (!subscription || !subscription.stripeCustomerId) {
				throw ctx.error("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
				});
			}
			const activeSubscriptions = await client.subscriptions
				.list({
					customer: subscription.stripeCustomerId,
				})
				.then((res) =>
					res.data.filter(
						(sub) => sub.status === "active" || sub.status === "trialing",
					),
				);
			if (!activeSubscriptions.length) {
				/**
				 * If the subscription is not found, we need to delete the subscription
				 * from the database. This is a rare case and should not happen.
				 */
				await ctx.context.adapter.deleteMany({
					model: "subscription",
					where: [
						{
							field: "referenceId",
							value: referenceId,
						},
					],
				});
				throw ctx.error("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
				});
			}
			const activeSubscription = activeSubscriptions.find(
				(sub) => sub.id === subscription.stripeSubscriptionId,
			);
			if (!activeSubscription) {
				throw ctx.error("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
				});
			}
			const { url } = await client.billingPortal.sessions
				.create({
					customer: subscription.stripeCustomerId,
					return_url: getUrl(
						ctx,
						`${
							ctx.context.baseURL
						}/subscription/cancel/callback?callbackURL=${encodeURIComponent(
							ctx.body?.returnUrl || "/",
						)}&subscriptionId=${encodeURIComponent(subscription.id)}`,
					),
					flow_data: {
						type: "subscription_cancel",
						subscription_cancel: {
							subscription: activeSubscription.id,
						},
					},
				})
				.catch(async (e) => {
					if (e.message.includes("already set to be cancel")) {
						/**
						 * in-case we missed the event from stripe, we set it manually
						 * this is a rare case and should not happen
						 */
						if (!subscription.cancelAtPeriodEnd) {
							await ctx.context.adapter.updateMany({
								model: "subscription",
								update: {
									cancelAtPeriodEnd: true,
								},
								where: [
									{
										field: "referenceId",
										value: referenceId,
									},
								],
							});
						}
					}
					throw ctx.error("BAD_REQUEST", {
						message: e.message,
						code: e.code,
					});
				});
			return {
				url,
				redirect: true,
			};
		},
	);
};

const restoreSubscriptionBodySchema = z.object({
	referenceId: z
		.string()
		.meta({
			description: "Reference id of the subscription to restore. Eg: '123'",
		})
		.optional(),
	subscriptionId: z
		.string()
		.meta({
			description: "The id of the subscription to restore. Eg: 'sub_123'",
		})
		.optional(),
});

export const restoreSubscription = (options: StripeOptions) => {
	const client = options.stripeClient;
	const subscriptionOptions = options.subscription as SubscriptionOptions;
	return createAuthEndpoint(
		"/subscription/restore",
		{
			method: "POST",
			body: restoreSubscriptionBodySchema,
			metadata: {
				openapi: {
					operationId: "restoreSubscription",
				},
			},
			use: [
				sessionMiddleware,
				referenceMiddleware(subscriptionOptions, "restore-subscription"),
			],
		},
		async (ctx) => {
			const referenceId = ctx.body?.referenceId || ctx.context.session.user.id;

			const subscription = ctx.body.subscriptionId
				? await ctx.context.adapter.findOne<Subscription>({
						model: "subscription",
						where: [
							{
								field: "id",
								value: ctx.body.subscriptionId,
							},
						],
					})
				: await ctx.context.adapter
						.findMany<Subscription>({
							model: "subscription",
							where: [
								{
									field: "referenceId",
									value: referenceId,
								},
							],
						})
						.then((subs) =>
							subs.find(
								(sub) => sub.status === "active" || sub.status === "trialing",
							),
						);
			if (!subscription || !subscription.stripeCustomerId) {
				throw ctx.error("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
				});
			}
			if (
				subscription.status != "active" &&
				subscription.status != "trialing"
			) {
				throw ctx.error("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_ACTIVE,
				});
			}
			if (!subscription.cancelAtPeriodEnd) {
				throw ctx.error("BAD_REQUEST", {
					message:
						STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION,
				});
			}

			const activeSubscription = await client.subscriptions
				.list({
					customer: subscription.stripeCustomerId,
				})
				.then(
					(res) =>
						res.data.filter(
							(sub) => sub.status === "active" || sub.status === "trialing",
						)[0],
				);
			if (!activeSubscription) {
				throw ctx.error("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
				});
			}

			try {
				const newSub = await client.subscriptions.update(
					activeSubscription.id,
					{
						cancel_at_period_end: false,
					},
				);

				await ctx.context.adapter.update({
					model: "subscription",
					update: {
						cancelAtPeriodEnd: false,
						updatedAt: new Date(),
					},
					where: [
						{
							field: "id",
							value: subscription.id,
						},
					],
				});

				return ctx.json(newSub);
			} catch (error) {
				ctx.context.logger.error("Error restoring subscription", error);
				throw new APIError("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.UNABLE_TO_CREATE_CUSTOMER,
				});
			}
		},
	);
};

const listActiveSubscriptionsQuerySchema = z.optional(
	z.object({
		referenceId: z
			.string()
			.meta({
				description: "Reference id of the subscription to list. Eg: '123'",
			})
			.optional(),
	}),
);
/**
 * ### Endpoint
 *
 * GET `/subscription/list`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.listActiveSubscriptions`
 *
 * **client:**
 * `authClient.subscription.list`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/stripe#api-method-subscription-list)
 */
export const listActiveSubscriptions = (options: StripeOptions) => {
	const subscriptionOptions = options.subscription as SubscriptionOptions;
	return createAuthEndpoint(
		"/subscription/list",
		{
			method: "GET",
			query: listActiveSubscriptionsQuerySchema,
			metadata: {
				openapi: {
					operationId: "listActiveSubscriptions",
				},
			},
			use: [
				sessionMiddleware,
				referenceMiddleware(subscriptionOptions, "list-subscription"),
			],
		},
		async (ctx) => {
			const subscriptions = await ctx.context.adapter.findMany<Subscription>({
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
			const plans = await getPlans(options.subscription);
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
						priceId: plan?.priceId,
					};
				})
				.filter((sub) => {
					return sub.status === "active" || sub.status === "trialing";
				});
			return ctx.json(subs);
		},
	);
};

const subscriptionSuccessQuerySchema = z.record(z.string(), z.any()).optional();

export const subscriptionSuccess = (options: StripeOptions) => {
	const client = options.stripeClient;
	return createAuthEndpoint(
		"/subscription/success",
		{
			method: "GET",
			query: subscriptionSuccessQuerySchema,
			metadata: {
				openapi: {
					operationId: "handleSubscriptionSuccess",
				},
			},
			use: [originCheck((ctx) => ctx.query.callbackURL)],
		},
		async (ctx) => {
			if (!ctx.query || !ctx.query.callbackURL || !ctx.query.subscriptionId) {
				throw ctx.redirect(getUrl(ctx, ctx.query?.callbackURL || "/"));
			}
			const session = await getSessionFromCtx<{ stripeCustomerId: string }>(
				ctx,
			);
			if (!session) {
				throw ctx.redirect(getUrl(ctx, ctx.query?.callbackURL || "/"));
			}
			const { user } = session;
			const { callbackURL, subscriptionId } = ctx.query;

			const subscription = await ctx.context.adapter.findOne<Subscription>({
				model: "subscription",
				where: [
					{
						field: "id",
						value: subscriptionId,
					},
				],
			});

			if (
				subscription?.status === "active" ||
				subscription?.status === "trialing"
			) {
				return ctx.redirect(getUrl(ctx, callbackURL));
			}
			const customerId =
				subscription?.stripeCustomerId || user.stripeCustomerId;

			if (customerId) {
				try {
					const stripeSubscription = await client.subscriptions
						.list({
							customer: customerId,
							status: "active",
						})
						.then((res) => res.data[0]);

					if (stripeSubscription) {
						const plan = await getPlanByPriceInfo(
							options,
							stripeSubscription.items.data[0]?.price.id!,
							stripeSubscription.items.data[0]?.price.lookup_key!,
						);

						if (plan && subscription) {
							await ctx.context.adapter.update({
								model: "subscription",
								update: {
									status: stripeSubscription.status,
									seats: stripeSubscription.items.data[0]?.quantity || 1,
									plan: plan.name.toLowerCase(),
									periodEnd: new Date(
										stripeSubscription.items.data[0]?.current_period_end! *
											1000,
									),
									periodStart: new Date(
										stripeSubscription.items.data[0]?.current_period_start! *
											1000,
									),
									stripeSubscriptionId: stripeSubscription.id,
									...(stripeSubscription.trial_start &&
									stripeSubscription.trial_end
										? {
												trialStart: new Date(
													stripeSubscription.trial_start * 1000,
												),
												trialEnd: new Date(stripeSubscription.trial_end * 1000),
											}
										: {}),
								},
								where: [
									{
										field: "id",
										value: subscription.id,
									},
								],
							});
						}
					}
				} catch (error) {
					ctx.context.logger.error(
						"Error fetching subscription from Stripe",
						error,
					);
				}
			}
			throw ctx.redirect(getUrl(ctx, callbackURL));
		},
	);
};

const createBillingPortalBodySchema = z.object({
	locale: z
		.custom<StripeType.Checkout.Session.Locale>((localization) => {
			return typeof localization === "string";
		})
		.optional(),
	referenceId: z.string().optional(),
	returnUrl: z.string().default("/"),
});

export const createBillingPortal = (options: StripeOptions) => {
	const client = options.stripeClient;
	const subscriptionOptions = options.subscription as SubscriptionOptions;
	return createAuthEndpoint(
		"/subscription/billing-portal",
		{
			method: "POST",
			body: createBillingPortalBodySchema,
			metadata: {
				openapi: {
					operationId: "createBillingPortal",
				},
			},
			use: [
				sessionMiddleware,
				originCheck((ctx) => ctx.body.returnUrl),
				referenceMiddleware(subscriptionOptions, "billing-portal"),
			],
		},
		async (ctx) => {
			const { user } = ctx.context.session;
			const referenceId = ctx.body.referenceId || user.id;

			let customerId = user.stripeCustomerId;

			if (!customerId) {
				const subscription = await ctx.context.adapter
					.findMany<Subscription>({
						model: "subscription",
						where: [
							{
								field: "referenceId",
								value: referenceId,
							},
						],
					})
					.then((subs) =>
						subs.find(
							(sub) => sub.status === "active" || sub.status === "trialing",
						),
					);

				customerId = subscription?.stripeCustomerId;
			}

			if (!customerId) {
				throw new APIError("BAD_REQUEST", {
					message: "No Stripe customer found for this user",
				});
			}

			try {
				const { url } = await client.billingPortal.sessions.create({
					locale: ctx.body.locale,
					customer: customerId,
					return_url: getUrl(ctx, ctx.body.returnUrl),
				});

				return ctx.json({
					url,
					redirect: true,
				});
			} catch (error: any) {
				ctx.context.logger.error(
					"Error creating billing portal session",
					error,
				);
				throw new APIError("BAD_REQUEST", {
					message: error.message,
				});
			}
		},
	);
};

export const stripeWebhook = (options: StripeOptions) => {
	const client = options.stripeClient;
	return createAuthEndpoint(
		"/stripe/webhook",
		{
			method: "POST",
			metadata: {
				isAction: false,
				openapi: {
					operationId: "handleStripeWebhook",
				},
			},
			cloneRequest: true,
			//don't parse the body
			disableBody: true,
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
				// Support both Stripe v18 (constructEvent) and v19+ (constructEventAsync)
				if (typeof client.webhooks.constructEventAsync === "function") {
					// Stripe v19+ - use async method
					event = await client.webhooks.constructEventAsync(
						buf,
						sig,
						webhookSecret,
					);
				} else {
					// Stripe v18 - use sync method
					event = client.webhooks.constructEvent(buf, sig, webhookSecret);
				}
			} catch (err: any) {
				ctx.context.logger.error(`${err.message}`);
				throw new APIError("BAD_REQUEST", {
					message: `Webhook Error: ${err.message}`,
				});
			}
			if (!event) {
				throw new APIError("BAD_REQUEST", {
					message: "Failed to construct event",
				});
			}
			try {
				switch (event.type) {
					case "checkout.session.completed":
						await onCheckoutSessionCompleted(ctx, options, event);
						await options.onEvent?.(event);
						break;
					case "customer.subscription.updated":
						await onSubscriptionUpdated(ctx, options, event);
						await options.onEvent?.(event);
						break;
					case "customer.subscription.deleted":
						await onSubscriptionDeleted(ctx, options, event);
						await options.onEvent?.(event);
						break;
					default:
						await options.onEvent?.(event);
						break;
				}
			} catch (e: any) {
				ctx.context.logger.error(`Stripe webhook failed. Error: ${e.message}`);
				throw new APIError("BAD_REQUEST", {
					message: "Webhook error: See server logs for more information.",
				});
			}
			return ctx.json({ success: true });
		},
	);
};

const getUrl = (ctx: GenericEndpointContext, url: string) => {
	if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(url)) {
		return url;
	}
	return `${ctx.context.options.baseURL}${
		url.startsWith("/") ? url : `/${url}`
	}`;
};

async function resolvePriceIdFromLookupKey(
	stripeClient: Stripe,
	lookupKey: string,
): Promise<string | undefined> {
	if (!lookupKey) return undefined;
	const prices = await stripeClient.prices.list({
		lookup_keys: [lookupKey],
		active: true,
		limit: 1,
	});
	return prices.data[0]?.id;
}
