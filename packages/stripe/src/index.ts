import { defineErrorCodes } from "@better-auth/core/utils";
import type { BetterAuthPlugin } from "better-auth";
import { defu } from "defu";
import type Stripe from "stripe";
import {
	cancelSubscription,
	cancelSubscriptionCallback,
	createBillingPortal,
	listActiveSubscriptions,
	restoreSubscription,
	stripeWebhook,
	subscriptionSuccess,
	upgradeSubscription,
} from "./routes";
import { getSchema } from "./schema";
import type {
	StripeOptions,
	StripePlan,
	Subscription,
	SubscriptionOptions,
} from "./types";

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

export const stripe = <O extends StripeOptions>(options: O) => {
	const client = options.stripeClient;

	const subscriptionEndpoints = {
		upgradeSubscription: upgradeSubscription(options),
		cancelSubscriptionCallback: cancelSubscriptionCallback(options),
		cancelSubscription: cancelSubscription(options),
		restoreSubscription: restoreSubscription(options),
		listActiveSubscriptions: listActiveSubscriptions(options),
		subscriptionSuccess: subscriptionSuccess(options),
		createBillingPortal: createBillingPortal(options),
	};

	return {
		id: "stripe",
		endpoints: {
			stripeWebhook: stripeWebhook(options),
			...((options.subscription?.enabled
				? subscriptionEndpoints
				: {}) as O["subscription"] extends {
				enabled: true;
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
									if (!ctx || !options.createCustomerOnSignUp) return;

									try {
										const userWithStripe = user as typeof user & {
											stripeCustomerId?: string;
										};

										// Skip if user already has a Stripe customer ID
										if (userWithStripe.stripeCustomerId) return;

										// Check if customer already exists in Stripe by email
										const existingCustomers = await client.customers.list({
											email: user.email,
											limit: 1,
										});

										let stripeCustomer = existingCustomers.data[0];

										// If customer exists, link it to prevent duplicate creation
										if (stripeCustomer) {
											await ctx.context.internalAdapter.updateUser(user.id, {
												stripeCustomerId: stripeCustomer.id,
											});
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
											extraCreateParams = await options.getCustomerCreateParams(
												user,
												ctx,
											);
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
										stripeCustomer = await client.customers.create(params);
										await ctx.context.internalAdapter.updateUser(user.id, {
											stripeCustomerId: stripeCustomer.id,
										});
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
							update: {
								async after(user, ctx) {
									if (!ctx) return;

									try {
										// Cast user to include stripeCustomerId (added by the stripe plugin schema)
										const userWithStripe = user as typeof user & {
											stripeCustomerId?: string;
										};

										// Only proceed if user has a Stripe customer ID
										if (!userWithStripe.stripeCustomerId) return;

										// Get the user from the database to check if email actually changed
										// The 'user' parameter here is the freshly updated user
										// We need to check if the Stripe customer's email matches
										const stripeCustomer = await client.customers.retrieve(
											userWithStripe.stripeCustomerId,
										);

										// Check if customer was deleted
										if (stripeCustomer.deleted) {
											ctx.context.logger.warn(
												`Stripe customer ${userWithStripe.stripeCustomerId} was deleted, cannot update email`,
											);
											return;
										}

										// If Stripe customer email doesn't match the user's current email, update it
										if (stripeCustomer.email !== user.email) {
											await client.customers.update(
												userWithStripe.stripeCustomerId,
												{
													email: user.email,
												},
											);
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

export type { Subscription, SubscriptionOptions, StripePlan };
