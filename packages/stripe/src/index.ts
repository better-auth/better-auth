import type { BetterAuthPlugin, User } from "better-auth";
import { APIError } from "better-auth";
import type { Organization } from "better-auth/plugins/organization";
import { defu } from "defu";
import type Stripe from "stripe";
import { STRIPE_ERROR_CODES } from "./error-codes";
import {
	cancelSubscription,
	cancelSubscriptionCallback,
	createBillingPortal,
	createEmbeddedCheckout,
	getCheckoutStatus,
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
	WithStripeCustomerId,
} from "./types";
import { escapeStripeSearchValue } from "./utils";

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: Auth and Context need to be same as declared in the module
	interface BetterAuthPluginRegistry<Auth, Context> {
		stripe: {
			creator: typeof stripe;
		};
	}
}

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
		createEmbeddedCheckout: createEmbeddedCheckout(options),
		getCheckoutStatus: getCheckoutStatus(options),
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
			if (options.organization?.enabled) {
				const orgPlugin = ctx.getPlugin("organization");
				if (!orgPlugin) {
					ctx.logger.error(`Organization plugin not found`);
					return;
				}

				const existingHooks = orgPlugin.options.organizationHooks ?? {};

				/**
				 * Sync organization name to Stripe customer
				 */
				const afterUpdateStripeOrg = async (data: {
					organization: (Organization & WithStripeCustomerId) | null;
					user: User;
				}) => {
					const { organization } = data;
					if (!organization?.stripeCustomerId) return;

					try {
						const stripeCustomer = await client.customers.retrieve(
							organization.stripeCustomerId,
						);

						if (stripeCustomer.deleted) {
							ctx.logger.warn(
								`Stripe customer ${organization.stripeCustomerId} was deleted`,
							);
							return;
						}

						// Update Stripe customer if name changed
						if (organization.name !== stripeCustomer.name) {
							await client.customers.update(organization.stripeCustomerId, {
								name: organization.name,
							});
							ctx.logger.info(
								`Synced organization name to Stripe: "${stripeCustomer.name}" → "${organization.name}"`,
							);
						}
					} catch (e: any) {
						ctx.logger.error(
							`Failed to sync organization to Stripe: ${e.message}`,
						);
					}
				};

				/**
				 * Block deletion if organization has active subscriptions
				 */
				const beforeDeleteStripeOrg = async (data: {
					organization: Organization & WithStripeCustomerId;
					user: User;
				}) => {
					const { organization } = data;
					if (!organization.stripeCustomerId) return;

					try {
						// Check if organization has any active subscriptions
						const subscriptions = await client.subscriptions.list({
							customer: organization.stripeCustomerId,
							status: "all",
							limit: 100, // 1 ~ 100
						});
						for (const sub of subscriptions.data) {
							if (
								sub.status !== "canceled" &&
								sub.status !== "incomplete" &&
								sub.status !== "incomplete_expired"
							) {
								throw APIError.from(
									"BAD_REQUEST",
										STRIPE_ERROR_CODES.ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION,
								);
							}
						}
					} catch (error: any) {
						if (error instanceof APIError) {
							throw error;
						}
						ctx.logger.error(
							`Failed to check organization subscriptions: ${error.message}`,
						);
						throw error;
					}
				};

				orgPlugin.options.organizationHooks = {
					...existingHooks,
					afterUpdateOrganization: existingHooks.afterUpdateOrganization
						? async (data) => {
								await existingHooks.afterUpdateOrganization!(data);
								await afterUpdateStripeOrg(data);
							}
						: afterUpdateStripeOrg,
					beforeDeleteOrganization: existingHooks.beforeDeleteOrganization
						? async (data) => {
								await existingHooks.beforeDeleteOrganization!(data);
								await beforeDeleteStripeOrg(data);
							}
						: beforeDeleteStripeOrg,
				};
			}

			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								async after(user: User & WithStripeCustomerId, ctx) {
									if (
										!ctx ||
										!options.createCustomerOnSignUp ||
										user.stripeCustomerId // Skip if user already has a Stripe customer ID
									) {
										return;
									}

									try {
										// Check if user customer already exists in Stripe by email
										const existingCustomers = await client.customers.search({
											query: `email:"${escapeStripeSearchValue(user.email)}" AND -metadata["customerType"]:"organization"`,
											limit: 1,
										});

										let stripeCustomer = existingCustomers.data[0];

										// If user customer exists, link it to prevent duplicate creation
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
													customerType: "user",
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
								async after(user: User & WithStripeCustomerId, ctx) {
									if (
										!ctx ||
										!user.stripeCustomerId // Only proceed if user has a Stripe customer ID
									)
										return;

									try {
										// Get the user from the database to check if email actually changed
										// The 'user' parameter here is the freshly updated user
										// We need to check if the Stripe customer's email matches
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
		options: options as NoInfer<O>,
		$ERROR_CODES: STRIPE_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

export type StripePlugin<O extends StripeOptions> = ReturnType<
	typeof stripe<O>
>;

export type { Subscription, SubscriptionOptions, StripePlan };
