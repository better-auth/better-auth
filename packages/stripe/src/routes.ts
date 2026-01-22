import { createAuthEndpoint } from "@better-auth/core/api";
import type { GenericEndpointContext, User } from "better-auth";
import { HIDE_METADATA } from "better-auth";
import { APIError, getSessionFromCtx, originCheck } from "better-auth/api";
import type { Organization } from "better-auth/plugins/organization";
import { defu } from "defu";
import type Stripe from "stripe";
import type { Stripe as StripeType } from "stripe";
import * as z from "zod/v4";
import { STRIPE_ERROR_CODES } from "./error-codes";
import {
	onCheckoutSessionCompleted,
	onSubscriptionCreated,
	onSubscriptionDeleted,
	onSubscriptionUpdated,
} from "./hooks";
import { referenceMiddleware, stripeSessionMiddleware } from "./middleware";
import type {
	CustomerType,
	StripeCtxSession,
	StripeOptions,
	Subscription,
	SubscriptionOptions,
	WithStripeCustomerId,
} from "./types";
import {
	escapeStripeSearchValue,
	getPlanByName,
	getPlanByPriceInfo,
	getPlans,
	isActiveOrTrialing,
	isPendingCancel,
	isStripePendingCancel,
} from "./utils";

/**
 * Converts a relative URL to an absolute URL using baseURL.
 * @internal
 */
function getUrl(ctx: GenericEndpointContext, url: string) {
	if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(url)) {
		return url;
	}
	return `${ctx.context.options.baseURL}${
		url.startsWith("/") ? url : `/${url}`
	}`;
}

/**
 * Resolves a Stripe price ID from a lookup key.
 * @internal
 */
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

/**
 * Determines the reference ID based on customer type.
 * - `user` (default): uses userId
 * - `organization`: uses activeOrganizationId from session
 * @internal
 */
function getReferenceId(
	ctxSession: StripeCtxSession,
	customerType: CustomerType | undefined,
	options: StripeOptions,
): string {
	const { user, session } = ctxSession;
	const type = customerType || "user";

	if (type === "organization") {
		if (!options.organization?.enabled) {
			throw new APIError("BAD_REQUEST", {
				message: STRIPE_ERROR_CODES.ORGANIZATION_SUBSCRIPTION_NOT_ENABLED,
			});
		}

		if (!session.activeOrganizationId) {
			throw new APIError("BAD_REQUEST", {
				message: STRIPE_ERROR_CODES.ORGANIZATION_NOT_FOUND,
			});
		}
		return session.activeOrganizationId;
	}

	return user.id;
}

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
	 * Reference ID for the subscription based on customerType:
	 * - `user`: defaults to `user.id`
	 * - `organization`: defaults to `session.activeOrganizationId`
	 */
	referenceId: z
		.string()
		.meta({
			description: 'Reference ID for the subscription. Eg: "org_123"',
		})
		.optional(),
	/**
	 * The Stripe subscription ID to upgrade.
	 * If provided and not found, it'll throw an error.
	 */
	subscriptionId: z
		.string()
		.meta({
			description:
				'The Stripe subscription ID to upgrade. Eg: "sub_1ABC2DEF3GHI4JKL"',
		})
		.optional(),
	/**
	 * Customer type for the subscription.
	 * - `user`: User owns the subscription (default)
	 * - `organization`: Organization owns the subscription (requires referenceId)
	 */
	customerType: z
		.enum(["user", "organization"])
		.meta({
			description:
				'Customer type for the subscription. Eg: "user" or "organization"',
		})
		.optional(),
	/**
	 * Additional metadata to store with the subscription.
	 */
	metadata: z.record(z.string(), z.any()).optional(),
	/**
	 * Number of seats for subscriptions.
	 */
	seats: z
		.number()
		.meta({
			description: "Number of seats to upgrade to (if applicable). Eg: 1",
		})
		.optional(),
	/**
	 * The IETF language tag of the locale Checkout is displayed in.
	 * If not provided or set to `auto`, the browser's locale is used.
	 */
	locale: z
		.custom<StripeType.Checkout.Session.Locale>((localization) => {
			return typeof localization === "string";
		})
		.meta({
			description:
				"The locale to display Checkout in. Eg: 'en', 'ko'. If not provided or set to `auto`, the browser's locale is used.",
		})
		.optional(),
	/**
	 * The URL to which Stripe should send customers when payment or setup is complete.
	 */
	successUrl: z
		.string()
		.meta({
			description:
				'Callback URL to redirect back after successful subscription. Eg: "https://example.com/success"',
		})
		.default("/"),
	/**
	 * If set, checkout shows a back button and customers will be directed here if they cancel payment.
	 */
	cancelUrl: z
		.string()
		.meta({
			description:
				'If set, checkout shows a back button and customers will be directed here if they cancel payment. Eg: "https://example.com/pricing"',
		})
		.default("/"),
	/**
	 * The URL to return to from the Billing Portal (used when upgrading existing subscriptions)
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
				stripeSessionMiddleware,
				referenceMiddleware(subscriptionOptions, "upgrade-subscription"),
				originCheck((c) => {
					return [c.body.successUrl as string, c.body.cancelUrl as string];
				}),
			],
		},
		async (ctx) => {
			const { user, session } = ctx.context.session;
			const customerType = ctx.body.customerType || "user";
			const referenceId =
				ctx.body.referenceId ||
				getReferenceId(ctx.context.session, customerType, options);

			if (!user.emailVerified && subscriptionOptions.requireEmailVerification) {
				throw new APIError("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED,
				});
			}

			const plan = await getPlanByName(options, ctx.body.plan);
			if (!plan) {
				throw new APIError("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.SUBSCRIPTION_PLAN_NOT_FOUND,
				});
			}

			// Find existing subscription by Stripe ID or reference ID
			let subscriptionToUpdate = ctx.body.subscriptionId
				? await ctx.context.adapter.findOne<Subscription>({
						model: "subscription",
						where: [
							{
								field: "stripeSubscriptionId",
								value: ctx.body.subscriptionId,
							},
						],
					})
				: referenceId
					? await ctx.context.adapter.findOne<Subscription>({
							model: "subscription",
							where: [
								{
									field: "referenceId",
									value: referenceId,
								},
							],
						})
					: null;

			if (
				ctx.body.subscriptionId &&
				subscriptionToUpdate &&
				subscriptionToUpdate.referenceId !== referenceId
			) {
				subscriptionToUpdate = null;
			}
			if (ctx.body.subscriptionId && !subscriptionToUpdate) {
				throw new APIError("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
				});
			}

			// Determine customer id
			let customerId: string | undefined;
			if (customerType === "organization") {
				// Organization subscription - get customer ID from organization
				customerId = subscriptionToUpdate?.stripeCustomerId;
				if (!customerId) {
					const org = await ctx.context.adapter.findOne<
						Organization & WithStripeCustomerId
					>({
						model: "organization",
						where: [
							{
								field: "id",
								value: referenceId,
							},
						],
					});
					if (!org) {
						throw new APIError("BAD_REQUEST", {
							message: STRIPE_ERROR_CODES.ORGANIZATION_NOT_FOUND,
						});
					}
					customerId = org.stripeCustomerId;

					// If org doesn't have a customer ID, create one
					if (!customerId) {
						try {
							// First, search for existing organization customer by organizationId
							const existingOrgCustomers = await client.customers.search({
								query: `metadata["organizationId"]:"${org.id}"`,
								limit: 1,
							});

							let stripeCustomer = existingOrgCustomers.data[0];

							if (!stripeCustomer) {
								// Get custom params if provided
								let extraCreateParams: Partial<StripeType.CustomerCreateParams> =
									{};
								if (options.organization?.getCustomerCreateParams) {
									extraCreateParams =
										await options.organization.getCustomerCreateParams(
											org,
											ctx,
										);
								}

								// Create Stripe customer for organization
								// Email can be set via getCustomerCreateParams or updated in billing portal
								// Use defu to ensure internal metadata fields are preserved
								const customerParams: StripeType.CustomerCreateParams = defu(
									{
										name: org.name,
										metadata: {
											...ctx.body.metadata,
											organizationId: org.id,
											customerType: "organization",
										},
									},
									extraCreateParams,
								);
								stripeCustomer = await client.customers.create(customerParams);

								// Call onCustomerCreate callback only for newly created customers
								await options.organization?.onCustomerCreate?.(
									{
										stripeCustomer,
										organization: {
											...org,
											stripeCustomerId: stripeCustomer.id,
										},
									},
									ctx,
								);
							}

							await ctx.context.adapter.update({
								model: "organization",
								update: {
									stripeCustomerId: stripeCustomer.id,
								},
								where: [
									{
										field: "id",
										value: org.id,
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
				}
			} else {
				// User subscription - get customer ID from user
				customerId =
					subscriptionToUpdate?.stripeCustomerId || user.stripeCustomerId;
				if (!customerId) {
					try {
						// Try to find existing user Stripe customer by email
						const existingCustomers = await client.customers.search({
							query: `email:"${escapeStripeSearchValue(user.email)}" AND -metadata["customerType"]:"organization"`,
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
									customerType: "user",
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
			}

			const subscriptions = subscriptionToUpdate
				? [subscriptionToUpdate]
				: await ctx.context.adapter.findMany<Subscription>({
						model: "subscription",
						where: [
							{
								field: "referenceId",
								value: referenceId,
							},
						],
					});

			const activeOrTrialingSubscription = subscriptions.find((sub) =>
				isActiveOrTrialing(sub),
			);

			const activeSubscriptions = await client.subscriptions
				.list({
					customer: customerId,
				})
				.then((res) => res.data.filter((sub) => isActiveOrTrialing(sub)));

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

			// Get the current price ID from the active Stripe subscription
			const stripeSubscriptionPriceId =
				activeSubscription?.items.data[0]?.price.id;

			// Also find any incomplete subscription that we can reuse
			const incompleteSubscription = subscriptions.find(
				(sub) => sub.status === "incomplete",
			);

			const priceId = ctx.body.annual
				? plan.annualDiscountPriceId
				: plan.priceId;
			const lookupKey = ctx.body.annual
				? plan.annualDiscountLookupKey
				: plan.lookupKey;
			const resolvedPriceId = lookupKey
				? await resolvePriceIdFromLookupKey(client, lookupKey)
				: undefined;

			const priceIdToUse = priceId || resolvedPriceId;
			if (!priceIdToUse) {
				throw ctx.error("BAD_REQUEST", {
					message: "Price ID not found for the selected plan",
				});
			}

			const isSamePlan = activeOrTrialingSubscription?.plan === ctx.body.plan;
			const isSameSeats =
				activeOrTrialingSubscription?.seats === (ctx.body.seats || 1);
			const isSamePriceId = stripeSubscriptionPriceId === priceIdToUse;
			const isSubscriptionStillValid =
				!activeOrTrialingSubscription?.periodEnd ||
				activeOrTrialingSubscription.periodEnd > new Date();

			const isAlreadySubscribed =
				activeOrTrialingSubscription?.status === "active" &&
				isSamePlan &&
				isSameSeats &&
				isSamePriceId &&
				isSubscriptionStillValid;
			if (isAlreadySubscribed) {
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
					await ctx.context.adapter.update<Subscription>({
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
					redirect: !ctx.body.disableRedirect,
				});
			}

			let subscription: Subscription | undefined =
				activeOrTrialingSubscription || incompleteSubscription;

			if (incompleteSubscription && !activeOrTrialingSubscription) {
				const updated = await ctx.context.adapter.update<Subscription>({
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
				subscription = await ctx.context.adapter.create<Subscription>({
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
				throw new APIError("NOT_FOUND", {
					message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
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

			const allSubscriptions = await ctx.context.adapter.findMany<Subscription>(
				{
					model: "subscription",
					where: [{ field: "referenceId", value: referenceId }],
				},
			);
			const hasEverTrialed = allSubscriptions.some((s) => {
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

			const checkoutSession = await client.checkout.sessions
				.create(
					{
						...(customerId
							? {
									customer: customerId,
									customer_update:
										customerType !== "user"
											? ({ address: "auto" } as const)
											: ({ name: "auto", address: "auto" } as const), // The customer name is automatically set only for users
								}
							: {
									customer_email: user.email,
								}),
						locale: ctx.body.locale,
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
							metadata: {
								...ctx.body.metadata,
								...params?.params?.subscription_data?.metadata,
								userId: user.id,
								subscriptionId: subscription.id,
								referenceId,
							},
						},
						mode: "subscription",
						client_reference_id: referenceId,
						...params?.params,
						metadata: {
							...ctx.body.metadata,
							...params?.params?.metadata,
							userId: user.id,
							subscriptionId: subscription.id,
							referenceId,
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
			const session = await getSessionFromCtx<User & WithStripeCustomerId>(ctx);
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
						subscription.status === "canceled" ||
						isPendingCancel(subscription)
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

					const isNewCancellation =
						currentSubscription &&
						isStripePendingCancel(currentSubscription) &&
						!isPendingCancel(subscription);
					if (isNewCancellation) {
						await ctx.context.adapter.update({
							model: "subscription",
							update: {
								status: currentSubscription?.status,
								cancelAtPeriodEnd:
									currentSubscription?.cancel_at_period_end || false,
								cancelAt: currentSubscription?.cancel_at
									? new Date(currentSubscription.cancel_at * 1000)
									: null,
								canceledAt: currentSubscription?.canceled_at
									? new Date(currentSubscription.canceled_at * 1000)
									: null,
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
			description:
				"The Stripe subscription ID to cancel. Eg: 'sub_1ABC2DEF3GHI4JKL'",
		})
		.optional(),
	/**
	 * Customer type for the subscription.
	 * - `user`: User owns the subscription (default)
	 * - `organization`: Organization owns the subscription
	 */
	customerType: z
		.enum(["user", "organization"])
		.meta({
			description:
				'Customer type for the subscription. Eg: "user" or "organization"',
		})
		.optional(),
	returnUrl: z.string().meta({
		description:
			'URL to take customers to when they click on the billing portal\'s link to return to your website. Eg: "/account"',
	}),
	/**
	 * Disable Redirect
	 */
	disableRedirect: z
		.boolean()
		.meta({
			description:
				"Disable redirect after successful subscription cancellation. Eg: true",
		})
		.default(false),
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
				stripeSessionMiddleware,
				referenceMiddleware(subscriptionOptions, "cancel-subscription"),
				originCheck((ctx) => ctx.body.returnUrl),
			],
		},
		async (ctx) => {
			const customerType = ctx.body.customerType || "user";
			const referenceId =
				ctx.body.referenceId ||
				getReferenceId(ctx.context.session, customerType, options);

			let subscription = ctx.body.subscriptionId
				? await ctx.context.adapter.findOne<Subscription>({
						model: "subscription",
						where: [
							{
								field: "stripeSubscriptionId",
								value: ctx.body.subscriptionId,
							},
						],
					})
				: await ctx.context.adapter
						.findMany<Subscription>({
							model: "subscription",
							where: [{ field: "referenceId", value: referenceId }],
						})
						.then((subs) => subs.find((sub) => isActiveOrTrialing(sub)));
			if (
				ctx.body.subscriptionId &&
				subscription &&
				subscription.referenceId !== referenceId
			) {
				subscription = undefined;
			}

			if (!subscription || !subscription.stripeCustomerId) {
				throw ctx.error("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
				});
			}
			const activeSubscriptions = await client.subscriptions
				.list({
					customer: subscription.stripeCustomerId,
				})
				.then((res) => res.data.filter((sub) => isActiveOrTrialing(sub)));
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
					if (e.message?.includes("already set to be canceled")) {
						/**
						 * in-case we missed the event from stripe, we sync the actual state
						 * this is a rare case and should not happen
						 */
						if (!isPendingCancel(subscription)) {
							const stripeSub = await client.subscriptions.retrieve(
								activeSubscription.id,
							);
							await ctx.context.adapter.update({
								model: "subscription",
								update: {
									cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
									cancelAt: stripeSub.cancel_at
										? new Date(stripeSub.cancel_at * 1000)
										: null,
									canceledAt: stripeSub.canceled_at
										? new Date(stripeSub.canceled_at * 1000)
										: null,
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
					throw ctx.error("BAD_REQUEST", {
						message: e.message,
						code: e.code,
					});
				});
			return ctx.json({
				url,
				redirect: !ctx.body.disableRedirect,
			});
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
			description:
				"The Stripe subscription ID to restore. Eg: 'sub_1ABC2DEF3GHI4JKL'",
		})
		.optional(),
	/**
	 * Customer type for the subscription.
	 * - `user`: User owns the subscription (default)
	 * - `organization`: Organization owns the subscription
	 */
	customerType: z
		.enum(["user", "organization"])
		.meta({
			description:
				'Customer type for the subscription. Eg: "user" or "organization"',
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
				stripeSessionMiddleware,
				referenceMiddleware(subscriptionOptions, "restore-subscription"),
			],
		},
		async (ctx) => {
			const customerType = ctx.body.customerType || "user";
			const referenceId =
				ctx.body.referenceId ||
				getReferenceId(ctx.context.session, customerType, options);

			let subscription = ctx.body.subscriptionId
				? await ctx.context.adapter.findOne<Subscription>({
						model: "subscription",
						where: [
							{
								field: "stripeSubscriptionId",
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
						.then((subs) => subs.find((sub) => isActiveOrTrialing(sub)));
			if (
				ctx.body.subscriptionId &&
				subscription &&
				subscription.referenceId !== referenceId
			) {
				subscription = undefined;
			}
			if (!subscription || !subscription.stripeCustomerId) {
				throw ctx.error("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
				});
			}
			if (!isActiveOrTrialing(subscription)) {
				throw ctx.error("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_ACTIVE,
				});
			}
			if (!isPendingCancel(subscription)) {
				throw ctx.error("BAD_REQUEST", {
					message:
						STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION,
				});
			}

			const activeSubscription = await client.subscriptions
				.list({
					customer: subscription.stripeCustomerId,
				})
				.then((res) => res.data.filter((sub) => isActiveOrTrialing(sub))[0]);
			if (!activeSubscription) {
				throw ctx.error("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
				});
			}

			// Clear scheduled cancellation based on Stripe subscription state
			// Note: Stripe doesn't accept both `cancel_at` and `cancel_at_period_end` simultaneously
			const updateParams: Stripe.SubscriptionUpdateParams = {};
			if (activeSubscription.cancel_at) {
				updateParams.cancel_at = "";
			} else if (activeSubscription.cancel_at_period_end) {
				updateParams.cancel_at_period_end = false;
			}

			const newSub = await client.subscriptions
				.update(activeSubscription.id, updateParams)
				.catch((e) => {
					throw ctx.error("BAD_REQUEST", {
						message: e.message,
						code: e.code,
					});
				});

			await ctx.context.adapter.update({
				model: "subscription",
				update: {
					cancelAtPeriodEnd: false,
					cancelAt: null,
					canceledAt: null,
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
		/**
		 * Customer type for the subscription.
		 * - `user`: User owns the subscription (default)
		 * - `organization`: Organization owns the subscription
		 */
		customerType: z
			.enum(["user", "organization"])
			.meta({
				description:
					'Customer type for the subscription. Eg: "user" or "organization"',
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
				stripeSessionMiddleware,
				referenceMiddleware(subscriptionOptions, "list-subscription"),
			],
		},
		async (ctx) => {
			const customerType = ctx.query?.customerType || "user";
			const referenceId =
				ctx.query?.referenceId ||
				getReferenceId(ctx.context.session, customerType, options);

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
				.filter((sub) => isActiveOrTrialing(sub));
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
			const { callbackURL, subscriptionId } = ctx.query;

			const session = await getSessionFromCtx<User & WithStripeCustomerId>(ctx);
			if (!session) {
				throw ctx.redirect(getUrl(ctx, ctx.query?.callbackURL || "/"));
			}

			const subscription = await ctx.context.adapter.findOne<Subscription>({
				model: "subscription",
				where: [
					{
						field: "id",
						value: subscriptionId,
					},
				],
			});
			if (!subscription) {
				ctx.context.logger.warn(
					`Subscription record not found for subscriptionId: ${subscriptionId}`,
				);
				throw ctx.redirect(getUrl(ctx, callbackURL));
			}

			// Already active or trialing, no need to update
			if (isActiveOrTrialing(subscription)) {
				throw ctx.redirect(getUrl(ctx, callbackURL));
			}

			const customerId =
				subscription.stripeCustomerId || session.user.stripeCustomerId;
			if (!customerId) {
				throw ctx.redirect(getUrl(ctx, callbackURL));
			}

			const stripeSubscription = await client.subscriptions
				.list({ customer: customerId, status: "active" })
				.then((res) => res.data[0])
				.catch((error) => {
					ctx.context.logger.error(
						"Error fetching subscription from Stripe",
						error,
					);
					throw ctx.redirect(getUrl(ctx, callbackURL));
				});
			if (!stripeSubscription) {
				throw ctx.redirect(getUrl(ctx, callbackURL));
			}

			const subscriptionItem = stripeSubscription.items.data[0];
			if (!subscriptionItem) {
				ctx.context.logger.warn(
					`No subscription items found for Stripe subscription ${stripeSubscription.id}`,
				);
				throw ctx.redirect(getUrl(ctx, callbackURL));
			}

			const plan = await getPlanByPriceInfo(
				options,
				subscriptionItem.price.id,
				subscriptionItem.price.lookup_key,
			);
			if (!plan) {
				ctx.context.logger.warn(
					`Plan not found for price ${subscriptionItem.price.id}`,
				);
				throw ctx.redirect(getUrl(ctx, callbackURL));
			}

			await ctx.context.adapter.update({
				model: "subscription",
				update: {
					status: stripeSubscription.status,
					seats: subscriptionItem.quantity || 1,
					plan: plan.name.toLowerCase(),
					periodEnd: new Date(subscriptionItem.current_period_end * 1000),
					periodStart: new Date(subscriptionItem.current_period_start * 1000),
					stripeSubscriptionId: stripeSubscription.id,
					cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
					cancelAt: stripeSubscription.cancel_at
						? new Date(stripeSubscription.cancel_at * 1000)
						: null,
					canceledAt: stripeSubscription.canceled_at
						? new Date(stripeSubscription.canceled_at * 1000)
						: null,
					...(stripeSubscription.trial_start && stripeSubscription.trial_end
						? {
								trialStart: new Date(stripeSubscription.trial_start * 1000),
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

			throw ctx.redirect(getUrl(ctx, callbackURL));
		},
	);
};

const createBillingPortalBodySchema = z.object({
	/**
	 * The IETF language tag of the locale Customer Portal is displayed in.
	 * If not provided or set to `auto`, the browser's locale is used.
	 */
	locale: z
		.custom<StripeType.Checkout.Session.Locale>((localization) => {
			return typeof localization === "string";
		})
		.meta({
			description:
				"The IETF language tag of the locale Customer Portal is displayed in. Eg: 'en', 'ko'. If not provided or set to `auto`, the browser's locale is used.",
		})
		.optional(),
	referenceId: z.string().optional(),
	/**
	 * Customer type for the subscription.
	 * - `user`: User owns the subscription (default)
	 * - `organization`: Organization owns the subscription
	 */
	customerType: z
		.enum(["user", "organization"])
		.meta({
			description:
				'Customer type for the subscription. Eg: "user" or "organization"',
		})
		.optional(),
	returnUrl: z.string().default("/"),
	/**
	 * Disable Redirect
	 */
	disableRedirect: z
		.boolean()
		.meta({
			description:
				"Disable redirect after creating billing portal session. Eg: true",
		})
		.default(false),
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
				stripeSessionMiddleware,
				referenceMiddleware(subscriptionOptions, "billing-portal"),
				originCheck((ctx) => ctx.body.returnUrl),
			],
		},
		async (ctx) => {
			const { user } = ctx.context.session;
			const customerType = ctx.body.customerType || "user";
			const referenceId =
				ctx.body.referenceId ||
				getReferenceId(ctx.context.session, customerType, options);

			let customerId: string | undefined;

			if (customerType === "organization") {
				// Organization billing portal - get customer ID from organization
				const org = await ctx.context.adapter.findOne<
					Organization & WithStripeCustomerId
				>({
					model: "organization",
					where: [{ field: "id", value: referenceId }],
				});
				customerId = org?.stripeCustomerId;

				if (!customerId) {
					// Fallback to subscription's stripeCustomerId
					const subscription = await ctx.context.adapter
						.findMany<Subscription>({
							model: "subscription",
							where: [{ field: "referenceId", value: referenceId }],
						})
						.then((subs) => subs.find((sub) => isActiveOrTrialing(sub)));
					customerId = subscription?.stripeCustomerId;
				}
			} else {
				// User billing portal
				customerId = user.stripeCustomerId;
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
						.then((subs) => subs.find((sub) => isActiveOrTrialing(sub)));

					customerId = subscription?.stripeCustomerId;
				}
			}
			if (!customerId) {
				throw new APIError("NOT_FOUND", {
					message: STRIPE_ERROR_CODES.CUSTOMER_NOT_FOUND,
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
					redirect: !ctx.body.disableRedirect,
				});
			} catch (error: any) {
				ctx.context.logger.error(
					"Error creating billing portal session",
					error,
				);
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: STRIPE_ERROR_CODES.UNABLE_TO_CREATE_BILLING_PORTAL,
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
				...HIDE_METADATA,
				openapi: {
					operationId: "handleStripeWebhook",
				},
			},
			cloneRequest: true,
			disableBody: true, // Don't parse the body
		},
		async (ctx) => {
			if (!ctx.request?.body) {
				throw new APIError("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.INVALID_REQUEST_BODY,
				});
			}

			const sig = ctx.request.headers.get("stripe-signature");
			if (!sig) {
				throw new APIError("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.STRIPE_SIGNATURE_NOT_FOUND,
				});
			}

			const webhookSecret = options.stripeWebhookSecret;
			if (!webhookSecret) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: STRIPE_ERROR_CODES.STRIPE_WEBHOOK_SECRET_NOT_FOUND,
				});
			}

			const payload = await ctx.request.text();

			let event: Stripe.Event;
			try {
				// Support both Stripe v18 (constructEvent) and v19+ (constructEventAsync)
				if (typeof client.webhooks.constructEventAsync === "function") {
					// Stripe v19+ - use async method
					event = await client.webhooks.constructEventAsync(
						payload,
						sig,
						webhookSecret,
					);
				} else {
					// Stripe v18 - use sync method
					event = client.webhooks.constructEvent(payload, sig, webhookSecret);
				}
			} catch (err: any) {
				ctx.context.logger.error(`${err.message}`);
				throw new APIError("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.FAILED_TO_CONSTRUCT_STRIPE_EVENT,
				});
			}
			if (!event) {
				throw new APIError("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.FAILED_TO_CONSTRUCT_STRIPE_EVENT,
				});
			}
			try {
				switch (event.type) {
					case "checkout.session.completed":
						await onCheckoutSessionCompleted(ctx, options, event);
						await options.onEvent?.(event);
						break;
					case "customer.subscription.created":
						await onSubscriptionCreated(ctx, options, event);
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
					message: STRIPE_ERROR_CODES.STRIPE_WEBHOOK_ERROR,
				});
			}
			return ctx.json({ success: true });
		},
	);
};
