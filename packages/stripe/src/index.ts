import {
	type GenericEndpointContext,
	type BetterAuthPlugin,
} from "better-auth";
import { createAuthEndpoint, createAuthMiddleware } from "better-auth/plugins";
import Stripe from "stripe";
import { z } from "zod";
import {
	sessionMiddleware,
	APIError,
	originCheck,
	getSessionFromCtx,
} from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import {
	onCheckoutSessionCompleted,
	onSubscriptionDeleted,
	onSubscriptionUpdated,
} from "./hooks";
import type { InputSubscription, StripeOptions, Subscription } from "./types";
import { getPlanByName, getPlanByPriceId, getPlans } from "./utils";
import { getSchema } from "./schema";

const STRIPE_ERROR_CODES = {
	SUBSCRIPTION_NOT_FOUND: "Subscription not found",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Subscription plan not found",
	ALREADY_SUBSCRIBED_PLAN: "You're already subscribed to this plan",
	UNABLE_TO_CREATE_CUSTOMER: "Unable to create customer",
	FAILED_TO_FETCH_PLANS: "Failed to fetch plans",
	EMAIL_VERIFICATION_REQUIRED:
		"Email verification is required before you can subscribe to a plan",
} as const;

const getUrl = (ctx: GenericEndpointContext, url: string) => {
	if (url.startsWith("http")) {
		return url;
	}
	return `${ctx.context.options.baseURL}${
		url.startsWith("/") ? url : `/${url}`
	}`;
};

export const stripe = <O extends StripeOptions>(options: O) => {
	const client = options.stripeClient;

	const referenceMiddleware = (
		action:
			| "upgrade-subscription"
			| "list-subscription"
			| "cancel-subscription",
	) =>
		createAuthMiddleware(async (ctx) => {
			const session = ctx.context.session;
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}
			const referenceId =
				ctx.body?.referenceId || ctx.query?.referenceId || session.user.id;
			const isAuthorized = ctx.body?.referenceId
				? await options.subscription?.authorizeReference?.({
						user: session.user,
						session: session.session,
						referenceId,
						action,
					})
				: true;
			if (!isAuthorized) {
				throw new APIError("UNAUTHORIZED", {
					message: "Unauthorized",
				});
			}
		});

	const subscriptionEndpoints = {
		upgradeSubscription: createAuthEndpoint(
			"/subscription/upgrade",
			{
				method: "POST",
				body: z.object({
					plan: z.string(),
					referenceId: z.string().optional(),
					metadata: z.record(z.string(), z.any()).optional(),
					seats: z
						.number({
							description: "Number of seats to upgrade to (if applicable)",
						})
						.optional(),
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
						return [c.body.successURL as string, c.body.cancelURL as string];
					}),
					referenceMiddleware("upgrade-subscription"),
				],
			},
			async (ctx) => {
				const { user, session } = ctx.context.session;
				if (
					!user.emailVerified &&
					options.subscription?.requireEmailVerification
				) {
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
				let customerId = user.stripeCustomerId;
				if (!customerId) {
					try {
						const stripeCustomer = await client.customers.create(
							{
								email: user.email,
								name: user.name,
								metadata: {
									...ctx.body.metadata,
									userId: user.id,
								},
							},
							{
								idempotencyKey: generateRandomString(32, "a-z", "0-9"),
							},
						);
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

				const activeSubscription = customerId
					? await client.subscriptions
							.list({
								customer: customerId,
								status: "active",
							})
							.then((res) => res.data[0])
							.catch((e) => null)
					: null;
				const subscriptions = await ctx.context.adapter.findMany<Subscription>({
					model: "subscription",
					where: [
						{
							field: "referenceId",
							value: ctx.body.referenceId || user.id,
						},
					],
				});
				const existingSubscription = subscriptions.find(
					(sub) => sub.status === "active" || sub.status === "trialing",
				);
				if (activeSubscription && customerId) {
					const { url } = await client.billingPortal.sessions
						.create({
							customer: customerId,
							return_url: getUrl(ctx, ctx.body.returnUrl || "/"),
							flow_data: {
								type: "subscription_update_confirm",
								subscription_update_confirm: {
									subscription: activeSubscription.id,
									items: [
										{
											id: activeSubscription.items.data[0]?.id as string,
											quantity: 1,
											price: plan.priceId,
										},
									],
								},
							},
						})
						.catch(async (e) => {
							if (e.message.includes("no changes")) {
								/**
								 * If the subscription is already active on stripe, we need to
								 * update the status to the new status.
								 */
								const plan = await getPlanByPriceId(
									options,
									activeSubscription.items.data[0]?.plan.id,
								);
								await ctx.context.adapter.update({
									model: "subscription",
									update: {
										status: activeSubscription.status,
										seats: activeSubscription.items.data[0]?.quantity,
										plan: plan?.name.toLowerCase(),
									},
									where: [
										{
											field: "referenceId",
											value: referenceId,
										},
									],
								});
								throw new APIError("BAD_REQUEST", {
									message: STRIPE_ERROR_CODES.ALREADY_SUBSCRIBED_PLAN,
								});
							}
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
							stripeCustomerId: customerId,
							status: "incomplete",
							referenceId,
							seats: ctx.body.seats || 1,
						},
					});
					subscription = newSubscription;
				}

				if (!subscription) {
					ctx.context.logger.error("Subscription ID not found");
					throw new APIError("INTERNAL_SERVER_ERROR");
				}

				const params = await options.subscription?.getCheckoutSessionParams?.(
					{
						user,
						session,
						plan,
						subscription,
					},
					ctx.request,
				);

				const checkoutSession = await client.checkout.sessions
					.create({
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
							)}&reference=${encodeURIComponent(referenceId)}`,
						),
						cancel_url: getUrl(ctx, ctx.body.cancelUrl),
						line_items: [
							{
								price: plan.priceId,
								quantity: ctx.body.seats || 1,
							},
						],
						mode: "subscription",
						client_reference_id: referenceId,
						...params,
						metadata: {
							userId: user.id,
							subscriptionId: subscription.id,
							referenceId,
							...params?.params?.metadata,
						},
					})
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
		),
		cancelSubscription: createAuthEndpoint(
			"/subscription/cancel",
			{
				method: "POST",
				body: z.object({
					referenceId: z.string().optional(),
					returnUrl: z.string(),
				}),
				use: [
					sessionMiddleware,
					originCheck((ctx) => ctx.body.returnUrl),
					referenceMiddleware("cancel-subscription"),
				],
			},
			async (ctx) => {
				const referenceId =
					ctx.body?.referenceId || ctx.context.session.user.id;
				const subscription = await ctx.context.adapter.findOne<Subscription>({
					model: "subscription",
					where: [
						{
							field: "referenceId",
							value: referenceId,
						},
					],
				});
				if (!subscription || !subscription.stripeCustomerId) {
					throw ctx.error("BAD_REQUEST", {
						message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
					});
				}
				const activeSubscription = await client.subscriptions
					.list({
						customer: subscription.stripeCustomerId,
						status: "active",
					})
					.then((res) => res.data[0]);
				if (!activeSubscription) {
					throw ctx.error("BAD_REQUEST", {
						message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
					});
				}
				const { url } = await client.billingPortal.sessions.create({
					customer: subscription.stripeCustomerId,
					return_url: getUrl(ctx, ctx.body?.returnUrl || "/"),
					flow_data: {
						type: "subscription_cancel",
						subscription_cancel: {
							subscription: activeSubscription.id,
						},
					},
				});
				return {
					url,
					redirect: true,
				};
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
				use: [sessionMiddleware, referenceMiddleware("list-subscription")],
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
		subscriptionSuccess: createAuthEndpoint(
			"/subscription/success",
			{
				method: "GET",
				query: z.record(z.string(), z.any()).optional(),
			},
			async (ctx) => {
				if (!ctx.query || !ctx.query.callbackURL || !ctx.query.reference) {
					throw ctx.redirect(getUrl(ctx, ctx.query?.callbackURL || "/"));
				}
				const session = await getSessionFromCtx<{ stripeCustomerId: string }>(
					ctx,
				);
				if (!session) {
					throw ctx.redirect(getUrl(ctx, ctx.query?.callbackURL || "/"));
				}
				const { user } = session;
				const { callbackURL, reference } = ctx.query;

				const subscriptions = await ctx.context.adapter.findMany<Subscription>({
					model: "subscription",
					where: [
						{
							field: "referenceId",
							value: reference,
						},
					],
				});

				const activeSubscription = subscriptions.find(
					(sub) => sub.status === "active" || sub.status === "trialing",
				);

				if (activeSubscription) {
					return ctx.redirect(getUrl(ctx, callbackURL));
				}

				if (user?.stripeCustomerId) {
					try {
						const subscription =
							await ctx.context.adapter.findOne<Subscription>({
								model: "subscription",
								where: [
									{
										field: "referenceId",
										value: reference,
									},
								],
							});
						if (!subscription || subscription.status === "active") {
							throw ctx.redirect(getUrl(ctx, callbackURL));
						}
						const stripeSubscription = await client.subscriptions
							.list({
								customer: user.stripeCustomerId,
								status: "active",
							})
							.then((res) => res.data[0]);

						if (stripeSubscription) {
							const plan = await getPlanByPriceId(
								options,
								stripeSubscription.items.data[0]?.plan.id,
							);

							if (plan && subscriptions.length > 0) {
								await ctx.context.adapter.update({
									model: "subscription",
									update: {
										status: stripeSubscription.status,
										seats: stripeSubscription.items.data[0]?.quantity || 1,
										plan: plan.name.toLowerCase(),
									},
									where: [
										{
											field: "referenceId",
											value: reference,
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
		),
	} as const;
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
			...((options.subscription?.enabled
				? subscriptionEndpoints
				: {}) as O["subscription"] extends {
				enabled: boolean;
			}
				? typeof subscriptionEndpoints
				: {}),
		},
		init(ctx) {
			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								async after(user, ctx) {
									if (ctx && options.createCustomerOnSignUp) {
										const stripeCustomer = await client.customers.create({
											email: user.email,
											name: user.name,
											metadata: {
												userId: user.id,
											},
										});
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
									}
								},
							},
						},
					},
				},
			};
		},
		schema: getSchema(options),
	} satisfies BetterAuthPlugin;
};

export type { Subscription };
