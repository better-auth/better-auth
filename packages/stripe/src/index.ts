import type { BetterAuthPlugin } from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import type { Session, User } from "@better-auth/core/db";
import { logger } from "better-auth";
import {
	APIError,
	getSessionFromCtx,
	originCheck,
	sessionMiddleware,
} from "better-auth/api";
import { defu } from "defu";
import Stripe, { type Stripe as StripeType } from "stripe";
import { z } from "zod";
import { STRIPE_ERROR_CODES } from "./error-codes";
import {
	onCheckoutSessionCompleted,
	onSubscriptionDeleted,
	onSubscriptionUpdated,
} from "./hooks";
import { getSchema } from "./schema";
import type {
	InputSubscription,
	OrganizationWithStripe,
	StripeOptions,
	StripePlan,
	Subscription,
	SubscriptionOptions,
	WithActiveOrganizationId,
	WithStripeCustomerId,
} from "./types";
import {
	getOrganizationPlugin,
	getPlanByName,
	getPlanByPriceInfo,
	getPlans,
	getReferenceId,
	getUrl,
	resolvePriceIdFromLookupKey,
} from "./utils";

export const stripe = <O extends StripeOptions>(options: O) => {
	const client = options.stripeClient;
	const subscriptionOptions = options.subscription as SubscriptionOptions;

	const referenceMiddleware = (
		action:
			| "upgrade-subscription"
			| "list-subscription"
			| "cancel-subscription"
			| "restore-subscription"
			| "billing-portal",
	) =>
		createAuthMiddleware(async (ctx) => {
			const session = ctx.context.session;
			if (!session) {
				throw new APIError("UNAUTHORIZED", {
					message: STRIPE_ERROR_CODES.UNAUTHORIZED,
				});
			}
			const referenceId =
				ctx.body?.referenceId || ctx.query?.referenceId || session.user.id;

			if (ctx.body?.referenceId && !subscriptionOptions.authorizeReference) {
				logger.error(
					`Passing referenceId into a subscription action isn't allowed if subscription.authorizeReference isn't defined in your stripe plugin config.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.REFERENCE_ID_NOT_ALLOWED,
				});
			}
			/**
			 * if referenceId is the same as the active session user's id
			 */
			const sameReference =
				ctx.query?.referenceId === session.user.id ||
				ctx.body?.referenceId === session.user.id;
			const isAuthorized =
				ctx.body?.referenceId || ctx.query?.referenceId
					? (await subscriptionOptions.authorizeReference?.(
							{
								user: session.user,
								session: session.session,
								referenceId,
								action,
							},
							ctx,
						)) || sameReference
					: true;
			if (!isAuthorized) {
				throw new APIError("UNAUTHORIZED", {
					message: STRIPE_ERROR_CODES.UNAUTHORIZED,
				});
			}
		});

	const subscriptionEndpoints = {
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
		upgradeSubscription: createAuthEndpoint(
			"/subscription/upgrade",
			{
				method: "POST",
				body: z.object({
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
							description:
								'Reference id of the subscription to upgrade. Eg: "123"',
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
							description:
								'The id of the subscription to upgrade. Eg: "sub_123"',
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
							description:
								"Number of seats to upgrade to (if applicable). Eg: 1",
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
							description:
								"Disable redirect after successful subscription. Eg: true",
						})
						.default(false),
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
				const ctxSession = ctx.context.session as {
					session: Session & WithActiveOrganizationId;
					user: User & WithStripeCustomerId;
				};
				const { user, session } = ctxSession;
				if (
					!user.emailVerified &&
					subscriptionOptions.requireEmailVerification
				) {
					throw new APIError("BAD_REQUEST", {
						message: STRIPE_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED,
					});
				}
				const referenceId = getReferenceId(ctx.body.referenceId, ctxSession);
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

				/**
				 * If enableOrganizationCustomer is enabled and referenceId is not userId,
				 * try to get organization customer
				 */
				if (options.enableOrganizationCustomer && referenceId !== user.id) {
					try {
						const organization =
							await ctx.context.adapter.findOne<OrganizationWithStripe>({
								model: "organization",
								where: [
									{
										field: "id",
										value: referenceId,
									},
								],
							});

						if (organization) {
							if (organization.stripeCustomerId) {
								customerId = organization.stripeCustomerId;
							} else {
								let stripeCustomer: Stripe.Customer | null = null;
								try {
									stripeCustomer = await client.customers.create({
										name: organization.name,
										email: user.email,
										metadata: {
											organizationId: organization.id,
											organizationName: organization.name,
											adminUserId: organization.stripeAdminUserId || user.id,
										},
									});

									// Check one more time before updating
									const currentOrg =
										await ctx.context.adapter.findOne<OrganizationWithStripe>({
											model: "organization",
											where: [
												{
													field: "id",
													value: organization.id,
												},
											],
										});

									if (currentOrg?.stripeCustomerId) {
										customerId = currentOrg.stripeCustomerId;
										ctx.context.logger.info(
											`organization already has customer ${currentOrg.stripeCustomerId}, deleting duplicate ${stripeCustomer.id}`,
										);
										await client.customers
											.del(stripeCustomer.id)
											.catch((e) =>
												ctx.context.logger.error(
													`Failed to delete duplicate Stripe customer: ${e.message}`,
												),
											);
									} else {
										const updateResult = await ctx.context.adapter.update({
											model: "organization",
											update: {
												stripeCustomerId: stripeCustomer.id,
												stripeAdminUserId:
													organization.stripeAdminUserId || user.id,
											},
											where: [
												{
													field: "id",
													value: organization.id,
												},
											],
										});

										if (!updateResult) {
											ctx.context.logger.error(
												`Failed to update organization ${organization.id} with stripeCustomerId`,
											);
											throw new APIError("BAD_REQUEST", {
												message:
													STRIPE_ERROR_CODES.FAILED_TO_UPDATE_ORGANIZATION_CUSTOMER,
											});
										}

										await options.onOrganizationCustomerCreate?.(
											{
												stripeCustomer,
												organization: {
													...organization,
													stripeCustomerId: stripeCustomer.id,
													stripeAdminUserId:
														organization.stripeAdminUserId || user.id,
												},
												adminUser: user,
											},
											ctx,
										);

										customerId = stripeCustomer.id;
										ctx.context.logger.info(
											`Created Stripe customer ${stripeCustomer.id} for organization ${organization.id}`,
										);
									}
								} catch (error: any) {
									// Rollback: Delete Stripe customer if we created one
									if (stripeCustomer) {
										await client.customers
											.del(stripeCustomer.id)
											.catch((e) =>
												ctx.context.logger.error(
													`Rollback failed - could not delete Stripe customer: ${e.message}`,
												),
											);
									}

									// Always throw APIError to prevent fallback
									if (error instanceof APIError) {
										throw error;
									}

									// Wrap other errors
									throw new APIError("BAD_REQUEST", {
										message:
											STRIPE_ERROR_CODES.FAILED_TO_CREATE_ORGANIZATION_CUSTOMER,
									});
								}
							}
						}
					} catch (e: any) {
						// APIError should be thrown immediately (no fallback)
						if (e instanceof APIError) {
							throw e;
						}
						ctx.context.logger.error(
							`Failed to get/create organization customer: ${e.message}`,
						);
					}
				}

				/**
				 * If still no customerId, try to get or create user customer
				 */
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
							message: STRIPE_ERROR_CODES.PRICE_ID_NOT_FOUND,
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
					throw new APIError("BAD_REQUEST", {
						message: STRIPE_ERROR_CODES.SUBSCRIPTION_ID_NOT_FOUND,
					});
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
				// Check if this is an organization subscription
				const isOrganizationSubscription =
					options.enableOrganizationCustomer && referenceId !== user.id;

				// Prepare customer data
				const customerData = customerId
					? {
							customer: customerId,
							customer_update: isOrganizationSubscription
								? ({ address: "auto" } as const) // managed by organization name
								: ({ name: "auto", address: "auto" } as const),
						}
					: { customer_email: user.email };

				const checkoutSession = await client.checkout.sessions
					.create(
						{
							...customerData,
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
		),
		cancelSubscriptionCallback: createAuthEndpoint(
			"/subscription/cancel/callback",
			{
				method: "GET",
				query: z.record(z.string(), z.any()).optional(),
				use: [originCheck((ctx) => ctx.query.callbackURL)], // sessionMiddleware not used for redirect
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
						const subscription =
							await ctx.context.adapter.findOne<Subscription>({
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
		),
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
		cancelSubscription: createAuthEndpoint(
			"/subscription/cancel",
			{
				method: "POST",
				body: z.object({
					referenceId: z
						.string()
						.meta({
							description:
								"Reference id of the subscription to cancel. Eg: '123'",
						})
						.optional(),
					subscriptionId: z
						.string()
						.meta({
							description:
								"The id of the subscription to cancel. Eg: 'sub_123'",
						})
						.optional(),
					returnUrl: z.string().meta({
						description:
							'URL to take customers to when they click on the billing portal’s link to return to your website. Eg: "https://example.com/dashboard"',
					}),
				}),
				use: [
					sessionMiddleware,
					originCheck((ctx) => ctx.body.returnUrl),
					referenceMiddleware("cancel-subscription"),
				],
			},
			async (ctx) => {
				const ctxSession = ctx.context.session as {
					session: Session & WithActiveOrganizationId;
					user: User & WithStripeCustomerId;
				};
				const referenceId = getReferenceId(ctx.body?.referenceId, ctxSession);
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
							 * incase we missed the event from stripe, we set it manually
							 * this is a rare case and should not happen
							 */
							if (!subscription.cancelAtPeriodEnd) {
								await ctx.context.adapter.update({
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
		),
		restoreSubscription: createAuthEndpoint(
			"/subscription/restore",
			{
				method: "POST",
				body: z.object({
					referenceId: z
						.string()
						.meta({
							description:
								"Reference id of the subscription to restore. Eg: '123'",
						})
						.optional(),
					subscriptionId: z
						.string()
						.meta({
							description:
								"The id of the subscription to restore. Eg: 'sub_123'",
						})
						.optional(),
				}),
				use: [sessionMiddleware, referenceMiddleware("restore-subscription")],
			},
			async (ctx) => {
				const ctxSession = ctx.context.session as {
					session: Session & WithActiveOrganizationId;
					user: User & WithStripeCustomerId;
				};
				const referenceId = getReferenceId(ctx.body?.referenceId, ctxSession);

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
		),
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
		listActiveSubscriptions: createAuthEndpoint(
			"/subscription/list",
			{
				method: "GET",
				query: z.optional(
					z.object({
						referenceId: z
							.string()
							.meta({
								description:
									"Reference id of the subscription to list. Eg: '123'",
							})
							.optional(),
					}),
				),
				use: [sessionMiddleware, referenceMiddleware("list-subscription")],
			},
			async (ctx) => {
				const ctxSession = ctx.context.session as {
					session: Session & WithActiveOrganizationId;
					user: User & WithStripeCustomerId;
				};
				const referenceId = getReferenceId(ctx.query?.referenceId, ctxSession);
				const subscriptions = await ctx.context.adapter.findMany<Subscription>({
					model: "subscription",
					where: [
						{
							field: "referenceId",
							value: referenceId,
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
		),
		subscriptionSuccess: createAuthEndpoint(
			"/subscription/success",
			{
				method: "GET",
				query: z.record(z.string(), z.any()).optional(),
				use: [originCheck((ctx) => ctx.query.callbackURL)], // sessionMiddleware not used for redirect
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
													trialEnd: new Date(
														stripeSubscription.trial_end * 1000,
													),
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
		),
		createBillingPortal: createAuthEndpoint(
			"/subscription/billing-portal",
			{
				method: "POST",
				body: z.object({
					locale: z
						.custom<StripeType.Checkout.Session.Locale>((localization) => {
							return typeof localization === "string";
						})
						.optional(),
					referenceId: z.string().optional(),
					returnUrl: z.string().default("/"),
				}),
				use: [
					sessionMiddleware,
					originCheck((ctx) => ctx.body.returnUrl),
					referenceMiddleware("billing-portal"),
				],
			},
			async (ctx) => {
				const ctxSession = ctx.context.session as {
					session: Session & WithActiveOrganizationId;
					user: User & WithStripeCustomerId;
				};
				const { user } = ctxSession;
				const referenceId = getReferenceId(ctx.body.referenceId, ctxSession);

				let customerId = user.stripeCustomerId;

				// If enableOrganizationCustomer is enabled and referenceId is not user.id, try to get organization customer
				if (options.enableOrganizationCustomer && referenceId !== user.id) {
					try {
						const organization =
							await ctx.context.adapter.findOne<OrganizationWithStripe>({
								model: "organization",
								where: [
									{
										field: "id",
										value: referenceId,
									},
								],
							});
						if (organization?.stripeCustomerId) {
							customerId = organization.stripeCustomerId;
						}
					} catch (e: any) {
						ctx.context.logger.error(
							`Failed to get organization customer: ${e.message}`,
						);
					}
				}

				// Fallback to subscription customer if still no customerId
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
						message: STRIPE_ERROR_CODES.CUSTOMER_ID_NOT_FOUND,
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
					// don't parse the body
					disableBody: true,
				},
				async (ctx) => {
					if (!ctx.request?.body) {
						throw new APIError("BAD_REQUEST", {
							message: STRIPE_ERROR_CODES.REQUEST_BODY_NOT_FOUND,
						});
					}
					const buf = await ctx.request.text();
					const sig = ctx.request.headers.get("stripe-signature") as string;
					if (!sig) {
						throw new APIError("BAD_REQUEST", {
							message: STRIPE_ERROR_CODES.STRIPE_SIGNATURE_NOT_FOUND,
						});
					}
					const webhookSecret = options.stripeWebhookSecret;
					if (!webhookSecret) {
						throw new APIError("BAD_REQUEST", {
							message: STRIPE_ERROR_CODES.STRIPE_WEBHOOK_SECRET_NOT_FOUND,
						});
					}

					let event: Stripe.Event;
					try {
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
							message: STRIPE_ERROR_CODES.STRIPE_WEBHOOK_ERROR,
						});
					}
					if (!event) {
						throw new APIError("BAD_REQUEST", {
							message: STRIPE_ERROR_CODES.STRIPE_WEBHOOK_EVENT_NOT_FOUND,
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
							message: STRIPE_ERROR_CODES.STRIPE_WEBHOOK_ERROR,
						});
					}
					return ctx.json({ success: true });
				},
			),
			...((options.subscription?.enabled
				? subscriptionEndpoints
				: {}) as O["subscription"] extends {
				enabled: true;
			}
				? typeof subscriptionEndpoints
				: {}),
		},

		init(ctx) {
			if (options.enableOrganizationCustomer && ctx.options?.plugins) {
				const orgPlugin = getOrganizationPlugin(ctx.options.plugins);
				if (!orgPlugin) {
					logger.error(`Organization plugin not found`);
					return;
				}

				const existingHooks = orgPlugin.options.organizationHooks || {};

				const afterCreateStripeOrg = async (data: {
					organization: OrganizationWithStripe;
					user: User;
				}) => {
					const { organization, user } = data;
					if (organization.stripeCustomerId) return;

					try {
						const stripeCustomer = await client.customers.create({
							name: organization.name,
							email: user.email,
							metadata: {
								organizationId: organization.id,
								organizationName: organization.name,
								adminUserId: user.id,
							},
						});

						await ctx.adapter.update({
							model: "organization",
							update: {
								stripeCustomerId: stripeCustomer.id,
								stripeAdminUserId: user.id,
							},
							where: [{ field: "id", value: organization.id }],
						});
					} catch (e: any) {
						logger.error(
							`[Stripe Sync] Failed to create Stripe customer: ${e.message}`,
						);
						// Don't throw
						// Allow organization creation to succeed even if Stripe fails -> user customer
					}
				};

				const afterUpdateStripeOrg = async (data: {
					organization: OrganizationWithStripe | null;
					user: User;
				}) => {
					const { organization } = data;

					logger.info(
						`[Stripe Sync] afterUpdateStripeOrg called - orgId: ${organization?.id}, stripeCustomerId: ${organization?.stripeCustomerId}`,
					);

					if (!organization?.stripeCustomerId) {
						logger.warn(
							`[Stripe Sync] Skipping - no stripeCustomerId for org: ${organization?.id}`,
						);
						return;
					}

					try {
						const stripeCustomer = await client.customers.retrieve(
							organization.stripeCustomerId,
						);

						if (!stripeCustomer.deleted) {
							logger.info(
								`[Stripe Sync] Retrieved customer ${organization.stripeCustomerId}`,
							);

							// Check if this update is coming from a recent Stripe webhook sync
							const lastSynced = stripeCustomer.metadata?.lastSyncedAt;
							if (lastSynced) {
								const lastSyncTime = new Date(lastSynced).getTime();
								const now = Date.now();
								const timeDiff = now - lastSyncTime;
								logger.info(
									`[Stripe Sync] lastSyncedAt: ${lastSynced}, timeDiff: ${timeDiff}ms`,
								);
								if (timeDiff < 2000) {
									logger.debug(
										`[Stripe Sync] Skipping - recently synced (${timeDiff}ms ago)`,
									);
									return;
								}
							}

							const stripeName = stripeCustomer.deleted
								? null
								: (stripeCustomer as any).name;
							const needsUpdate =
								organization.name !== stripeName ||
								organization.name !== stripeCustomer.metadata?.organizationName;

							logger.info(
								`[Stripe Sync] needsUpdate: ${needsUpdate}, orgName: "${organization.name}", stripeName: "${stripeName}", metadataOrgName: "${stripeCustomer.metadata?.organizationName}"`,
							);

							if (needsUpdate) {
								await client.customers.update(organization.stripeCustomerId, {
									name: organization.name,
									metadata: {
										...stripeCustomer.metadata,
										organizationName: organization.name,
										lastSyncedAt: new Date().toISOString(),
									},
								});
								logger.info(
									`[Stripe Sync] Successfully updated customer ${organization.stripeCustomerId} with name: "${organization.name}"`,
								);
							} else {
								logger.info(`[Stripe Sync] No update needed - names match`);
							}
						} else {
							logger.warn(
								`[Stripe Sync] Customer ${organization.stripeCustomerId} was deleted`,
							);
						}
					} catch (e: any) {
						logger.error(
							`[Stripe Sync] Failed to update Stripe customer: ${e.message}`,
						);
					}
				};

				const beforeDeleteStripeOrg = async (data: {
					organization: OrganizationWithStripe;
					user: User;
				}) => {
					const { organization } = data;
					if (!organization.stripeCustomerId) return;

					try {
						const stripeSubscriptions = await client.subscriptions.list({
							customer: organization.stripeCustomerId,
							status: "all",
							limit: 100,
						});

						const activeSubscriptions = stripeSubscriptions.data.filter(
							(sub) =>
								sub.status === "active" ||
								sub.status === "trialing" ||
								sub.status === "past_due" ||
								sub.status === "unpaid" ||
								sub.status === "paused",
						);

						if (activeSubscriptions.length > 0) {
							throw new APIError("BAD_REQUEST", {
								message:
									STRIPE_ERROR_CODES.ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION,
							});
						}
					} catch (error: any) {
						logger.error(
							`[Stripe Sync] Error checking subscriptions: ${error.message}`,
						);
						throw error;
					}
				};

				const afterDeleteStripeOrg = async (data: {
					organization: OrganizationWithStripe;
					user: User;
				}) => {
					const { organization } = data;
					if (!organization.stripeCustomerId) return;

					try {
						await client.customers.del(organization.stripeCustomerId);
					} catch (e: any) {
						logger.error(
							`[Stripe Sync] Failed to delete Stripe customer: ${e.message}`,
						);
					}
				};

				orgPlugin.options.organizationHooks = {
					afterCreateOrganization: existingHooks.afterCreateOrganization
						? async (data) => {
								await existingHooks.afterCreateOrganization!(data);
								await afterCreateStripeOrg(data);
							}
						: async (data) => {
								await afterCreateStripeOrg(data);
							},
					afterUpdateOrganization: existingHooks.afterUpdateOrganization
						? async (data) => {
								await existingHooks.afterUpdateOrganization!(data);
								await afterUpdateStripeOrg(data);
							}
						: async (data) => {
								await afterUpdateStripeOrg(data);
							},
					beforeDeleteOrganization: existingHooks.beforeDeleteOrganization
						? async (data) => {
								await existingHooks.beforeDeleteOrganization!(data);
								await beforeDeleteStripeOrg(data);
							}
						: beforeDeleteStripeOrg,
					afterDeleteOrganization: existingHooks.afterDeleteOrganization
						? async (data) => {
								await existingHooks.afterDeleteOrganization!(data);
								await afterDeleteStripeOrg(data);
							}
						: afterDeleteStripeOrg,
				};
			}

			return {
				options: {
					databaseHooks: {
						user: {
							// Only register create hook when createCustomerOnSignUp is enabled
							...(options.createCustomerOnSignUp
								? {
										create: {
											async after(user: User & WithStripeCustomerId, ctx) {
												if (!ctx || user.stripeCustomerId) {
													return;
												}

												try {
													// Check if customer already exists in Stripe by email
													const existingCustomers = await client.customers.list(
														{
															email: user.email,
															limit: 1,
														},
													);

													let stripeCustomer = existingCustomers.data[0];

													// If customer exists, link it to prevent duplicate creation
													if (stripeCustomer) {
														await ctx.context.internalAdapter.updateUser(
															user.id,
															{
																stripeCustomerId: stripeCustomer.id,
															},
														);
														await options.onCustomerCreate?.(
															{
																stripeCustomer,
																user: {
																	...user,
																	stripeCustomerId: stripeCustomer.id,
																},
															},
															ctx,
														);
														ctx.context.logger.info(
															`Linked existing Stripe customer ${stripeCustomer.id} to user ${user.id}`,
														);
														return;
													}

													// Create new Stripe customer
													let extraCreateParams: Partial<Stripe.CustomerCreateParams> =
														{};
													if (options.getCustomerCreateParams) {
														extraCreateParams =
															await options.getCustomerCreateParams(user, ctx);
													}

													const params: Stripe.CustomerCreateParams = defu(
														{
															email: user.email,
															name: user.name,
															metadata: {
																userId: user.id,
															},
														},
														extraCreateParams,
													);
													stripeCustomer =
														await client.customers.create(params);
													await ctx.context.internalAdapter.updateUser(
														user.id,
														{
															stripeCustomerId: stripeCustomer.id,
														},
													);
													await options.onCustomerCreate?.(
														{
															stripeCustomer,
															user: {
																...user,
																stripeCustomerId: stripeCustomer.id,
															},
														},
														ctx,
													);
													ctx.context.logger.info(
														`Created new Stripe customer ${stripeCustomer.id} for user ${user.id}`,
													);
												} catch (e: any) {
													ctx.context.logger.error(
														`Failed to create or link Stripe customer: ${e.message}`,
														e,
													);
												}
											},
										},
									}
								: {}),
							// Always register update hook to sync email changes
							update: {
								async after(user: User & WithStripeCustomerId, ctx) {
									if (
										!ctx ||
										!user.stripeCustomerId // Only proceed if user has a Stripe customer ID
									) {
										return;
									}

									try {
										const stripeCustomer = await client.customers.retrieve(
											user.stripeCustomerId,
										);

										// Check if customer was deleted
										if (stripeCustomer.deleted) {
											ctx.context.logger.warn(
												`Stripe customer ${user.stripeCustomerId} was deleted, cannot update email`,
											);
											return;
										}

										// If Stripe customer email doesn't match the user's current email, update it
										if (stripeCustomer.email !== user.email) {
											await client.customers.update(user.stripeCustomerId, {
												email: user.email,
											});
											ctx.context.logger.info(
												`Updated Stripe customer email from ${stripeCustomer.email} to ${user.email}`,
											);
										}
									} catch (e: any) {
										// Ignore errors - this is a best-effort sync
										// Email might have been deleted or Stripe customer might not exist
										ctx.context.logger.error(
											`Failed to sync email to Stripe customer: ${e.message}`,
											e,
										);
									}
								},
							},
						},
					},
				},
			};
		},
		schema: getSchema(options),
		$ERROR_CODES: STRIPE_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

export type StripePlugin<O extends StripeOptions> = ReturnType<
	typeof stripe<O>
>;

export type { OrganizationWithStripe, Subscription, StripePlan };
