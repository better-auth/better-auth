import type { GenericEndpointContext } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import type { Organization } from "better-auth/plugins/organization";
import type Stripe from "stripe";
import { subscriptionMetadata } from "./metadata";
import type { CustomerType, StripeOptions, Subscription } from "./types";
import {
	isActiveOrTrialing,
	isPendingCancel,
	isStripePendingCancel,
	resolvePlanItem,
	resolveQuantity,
} from "./utils";

/**
 * Find organization or user by stripeCustomerId.
 * @internal
 */
async function findReferenceByStripeCustomerId(
	ctx: GenericEndpointContext,
	options: StripeOptions,
	stripeCustomerId: string,
): Promise<{ customerType: CustomerType; referenceId: string } | null> {
	if (options.organization?.enabled) {
		const org = await ctx.context.adapter.findOne<Organization>({
			model: "organization",
			where: [{ field: "stripeCustomerId", value: stripeCustomerId }],
		});
		if (org) return { customerType: "organization", referenceId: org.id };
	}

	const user = await ctx.context.adapter.findOne<User>({
		model: "user",
		where: [{ field: "stripeCustomerId", value: stripeCustomerId }],
	});
	if (user) return { customerType: "user", referenceId: user.id };

	return null;
}

export async function onCheckoutSessionCompleted(
	ctx: GenericEndpointContext,
	options: StripeOptions,
	event: Stripe.Event,
) {
	try {
		const client = options.stripeClient;
		const checkoutSession = event.data.object as Stripe.Checkout.Session;
		if (checkoutSession.mode === "setup" || !options.subscription?.enabled) {
			return;
		}
		const subscription = await client.subscriptions.retrieve(
			checkoutSession.subscription as string,
		);
		const resolved = await resolvePlanItem(options, subscription.items.data);
		if (!resolved) {
			ctx.context.logger.warn(
				`Stripe webhook warning: Subscription ${subscription.id} has no items matching a configured plan`,
			);
			return;
		}

		const { item: subscriptionItem, plan } = resolved;
		if (plan) {
			const checkoutMeta = subscriptionMetadata.get(checkoutSession?.metadata);
			const referenceId =
				checkoutSession?.client_reference_id || checkoutMeta.referenceId;
			const { subscriptionId } = checkoutMeta;
			const seats = resolveQuantity(
				subscription.items.data,
				subscriptionItem,
				plan.seatPriceId,
			);
			if (referenceId && subscriptionId) {
				const trial =
					subscription.trial_start && subscription.trial_end
						? {
								trialStart: new Date(subscription.trial_start * 1000),
								trialEnd: new Date(subscription.trial_end * 1000),
							}
						: {};

				let dbSubscription = await ctx.context.adapter.update<Subscription>({
					model: "subscription",
					update: {
						...trial,
						plan: plan.name.toLowerCase(),
						status: subscription.status,
						updatedAt: new Date(),
						periodStart: new Date(subscriptionItem.current_period_start * 1000),
						periodEnd: new Date(subscriptionItem.current_period_end * 1000),
						stripeSubscriptionId: checkoutSession.subscription as string,
						cancelAtPeriodEnd: subscription.cancel_at_period_end,
						cancelAt: subscription.cancel_at
							? new Date(subscription.cancel_at * 1000)
							: null,
						canceledAt: subscription.canceled_at
							? new Date(subscription.canceled_at * 1000)
							: null,
						endedAt: subscription.ended_at
							? new Date(subscription.ended_at * 1000)
							: null,
						seats: seats,
						billingInterval: subscriptionItem.price.recurring?.interval,
					},
					where: [
						{
							field: "id",
							value: subscriptionId,
						},
					],
				});

				if (trial.trialStart && plan.freeTrial?.onTrialStart) {
					await plan.freeTrial.onTrialStart(dbSubscription as Subscription);
				}

				if (!dbSubscription) {
					dbSubscription = await ctx.context.adapter.findOne<Subscription>({
						model: "subscription",
						where: [
							{
								field: "id",
								value: subscriptionId,
							},
						],
					});
				}
				await options.subscription?.onSubscriptionComplete?.(
					{
						event,
						subscription: dbSubscription as Subscription,
						stripeSubscription: subscription,
						plan,
					},
					ctx,
				);
				return;
			}
		}
	} catch (e: any) {
		ctx.context.logger.error(`Stripe webhook failed. Error: ${e.message}`);
	}
}

export async function onSubscriptionCreated(
	ctx: GenericEndpointContext,
	options: StripeOptions,
	event: Stripe.Event,
) {
	try {
		if (!options.subscription?.enabled) {
			return;
		}

		const stripeSubscriptionCreated = event.data.object as Stripe.Subscription;
		const stripeCustomerId = stripeSubscriptionCreated.customer?.toString();
		if (!stripeCustomerId) {
			ctx.context.logger.warn(
				`Stripe webhook warning: customer.subscription.created event received without customer ID`,
			);
			return;
		}

		// Check if subscription already exists in database
		const { subscriptionId } = subscriptionMetadata.get(
			stripeSubscriptionCreated.metadata,
		);
		const existingSubscription =
			await ctx.context.adapter.findOne<Subscription>({
				model: "subscription",
				where: subscriptionId
					? [{ field: "id", value: subscriptionId }]
					: [
							{
								field: "stripeSubscriptionId",
								value: stripeSubscriptionCreated.id,
							},
						], // Probably won't match since it's not set yet
			});
		if (existingSubscription) {
			ctx.context.logger.info(
				`Stripe webhook: Subscription already exists in database (id: ${existingSubscription.id}), skipping creation`,
			);
			return;
		}

		// Find reference
		const reference = await findReferenceByStripeCustomerId(
			ctx,
			options,
			stripeCustomerId,
		);
		if (!reference) {
			ctx.context.logger.warn(
				`Stripe webhook warning: No user or organization found with stripeCustomerId: ${stripeCustomerId}`,
			);
			return;
		}
		const { referenceId, customerType } = reference;

		const resolved = await resolvePlanItem(
			options,
			stripeSubscriptionCreated.items.data,
		);
		if (!resolved) {
			ctx.context.logger.warn(
				`Stripe webhook warning: Subscription ${stripeSubscriptionCreated.id} has no items matching a configured plan`,
			);
			return;
		}

		const { item: subscriptionItem, plan } = resolved;
		if (!plan) {
			ctx.context.logger.warn(
				`Stripe webhook warning: No matching plan found for priceId: ${subscriptionItem.price.id}`,
			);
			return;
		}

		const seats = resolveQuantity(
			stripeSubscriptionCreated.items.data,
			subscriptionItem,
			plan.seatPriceId,
		);
		const periodStart = new Date(subscriptionItem.current_period_start * 1000);
		const periodEnd = new Date(subscriptionItem.current_period_end * 1000);

		const trial =
			stripeSubscriptionCreated.trial_start &&
			stripeSubscriptionCreated.trial_end
				? {
						trialStart: new Date(stripeSubscriptionCreated.trial_start * 1000),
						trialEnd: new Date(stripeSubscriptionCreated.trial_end * 1000),
					}
				: {};

		// Create the subscription in the database
		const newSubscription = await ctx.context.adapter.create<Subscription>({
			model: "subscription",
			data: {
				...trial,
				...(plan.limits ? { limits: plan.limits } : {}),
				referenceId,
				stripeCustomerId,
				stripeSubscriptionId: stripeSubscriptionCreated.id,
				status: stripeSubscriptionCreated.status,
				plan: plan.name.toLowerCase(),
				periodStart,
				periodEnd,
				seats,
				billingInterval: subscriptionItem.price.recurring?.interval,
			},
		});

		ctx.context.logger.info(
			`Stripe webhook: Created subscription ${stripeSubscriptionCreated.id} for ${customerType} ${referenceId} from dashboard`,
		);

		await options.subscription.onSubscriptionCreated?.({
			event,
			subscription: newSubscription,
			stripeSubscription: stripeSubscriptionCreated,
			plan,
		});
	} catch (error: any) {
		ctx.context.logger.error(`Stripe webhook failed. Error: ${error}`);
	}
}

export async function onSubscriptionUpdated(
	ctx: GenericEndpointContext,
	options: StripeOptions,
	event: Stripe.Event,
) {
	try {
		if (!options.subscription?.enabled) {
			return;
		}
		const stripeSubscriptionUpdated = event.data.object as Stripe.Subscription;
		const resolved = await resolvePlanItem(
			options,
			stripeSubscriptionUpdated.items.data,
		);
		if (!resolved) {
			ctx.context.logger.warn(
				`Stripe webhook warning: Subscription ${stripeSubscriptionUpdated.id} has no items matching a configured plan`,
			);
			return;
		}

		const { item: subscriptionItem, plan } = resolved;

		const { subscriptionId } = subscriptionMetadata.get(
			stripeSubscriptionUpdated.metadata,
		);
		const customerId = stripeSubscriptionUpdated.customer?.toString();
		let subscription = await ctx.context.adapter.findOne<Subscription>({
			model: "subscription",
			where: subscriptionId
				? [{ field: "id", value: subscriptionId }]
				: [
						{
							field: "stripeSubscriptionId",
							value: stripeSubscriptionUpdated.id,
						},
					],
		});
		if (!subscription) {
			const subs = await ctx.context.adapter.findMany<Subscription>({
				model: "subscription",
				where: [{ field: "stripeCustomerId", value: customerId }],
			});
			if (subs.length > 1) {
				const activeSub = subs.find((sub: Subscription) =>
					isActiveOrTrialing(sub),
				);
				if (!activeSub) {
					ctx.context.logger.warn(
						`Stripe webhook error: Multiple subscriptions found for customerId: ${customerId} and no active subscription is found`,
					);
					return;
				}
				subscription = activeSub;
			} else {
				subscription = subs[0]!;
			}
		}

		const seats = plan
			? resolveQuantity(
					stripeSubscriptionUpdated.items.data,
					subscriptionItem,
					plan.seatPriceId,
				)
			: subscriptionItem.quantity;

		const trial =
			stripeSubscriptionUpdated.trial_start &&
			stripeSubscriptionUpdated.trial_end
				? {
						trialStart: new Date(stripeSubscriptionUpdated.trial_start * 1000),
						trialEnd: new Date(stripeSubscriptionUpdated.trial_end * 1000),
					}
				: {};

		const subscriptionUpdated = await ctx.context.adapter.update<Subscription>({
			model: "subscription",
			update: {
				...trial,
				...(plan
					? {
							plan: plan.name.toLowerCase(),
							limits: plan.limits,
						}
					: {}),
				updatedAt: new Date(),
				status: stripeSubscriptionUpdated.status,
				periodStart: new Date(subscriptionItem.current_period_start * 1000),
				periodEnd: new Date(subscriptionItem.current_period_end * 1000),
				cancelAtPeriodEnd: stripeSubscriptionUpdated.cancel_at_period_end,
				cancelAt: stripeSubscriptionUpdated.cancel_at
					? new Date(stripeSubscriptionUpdated.cancel_at * 1000)
					: null,
				canceledAt: stripeSubscriptionUpdated.canceled_at
					? new Date(stripeSubscriptionUpdated.canceled_at * 1000)
					: null,
				endedAt: stripeSubscriptionUpdated.ended_at
					? new Date(stripeSubscriptionUpdated.ended_at * 1000)
					: null,
				seats,
				stripeSubscriptionId: stripeSubscriptionUpdated.id,
				billingInterval: subscriptionItem.price.recurring?.interval,
				stripeScheduleId: stripeSubscriptionUpdated.schedule
					? typeof stripeSubscriptionUpdated.schedule === "string"
						? stripeSubscriptionUpdated.schedule
						: stripeSubscriptionUpdated.schedule.id
					: null,
			},
			where: [
				{
					field: "id",
					value: subscription.id,
				},
			],
		});
		// Practically unreachable. A null here means the row was deleted between the read above and this update.
		if (!subscriptionUpdated) {
			ctx.context.logger.warn(
				`Stripe webhook warning: Subscription ${subscription.id} update returned no row (likely deleted concurrently), skipping callbacks`,
			);
			return;
		}

		const isNewCancellation =
			stripeSubscriptionUpdated.status === "active" &&
			isStripePendingCancel(stripeSubscriptionUpdated) &&
			!isPendingCancel(subscription);
		if (isNewCancellation) {
			await options.subscription.onSubscriptionCancel?.({
				event,
				subscription: subscriptionUpdated,
				stripeSubscription: stripeSubscriptionUpdated,
				cancellationDetails:
					stripeSubscriptionUpdated.cancellation_details || undefined,
			});
		}
		await options.subscription.onSubscriptionUpdate?.({
			event,
			subscription: subscriptionUpdated,
			stripeSubscription: stripeSubscriptionUpdated,
		});
		if (plan) {
			if (
				stripeSubscriptionUpdated.status === "active" &&
				subscription.status === "trialing" &&
				plan.freeTrial?.onTrialEnd
			) {
				await plan.freeTrial.onTrialEnd({ subscription }, ctx);
			}
			if (
				stripeSubscriptionUpdated.status === "incomplete_expired" &&
				subscription.status === "trialing" &&
				plan.freeTrial?.onTrialExpired
			) {
				await plan.freeTrial.onTrialExpired(subscription, ctx);
			}
		}
	} catch (error: any) {
		ctx.context.logger.error(`Stripe webhook failed. Error: ${error}`);
	}
}

export async function onSubscriptionDeleted(
	ctx: GenericEndpointContext,
	options: StripeOptions,
	event: Stripe.Event,
) {
	if (!options.subscription?.enabled) {
		return;
	}
	try {
		const stripeSubscriptionDeleted = event.data.object as Stripe.Subscription;
		const subscriptionId = stripeSubscriptionDeleted.id;
		const subscription = await ctx.context.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "stripeSubscriptionId",
					value: subscriptionId,
				},
			],
		});
		if (subscription) {
			const trial =
				stripeSubscriptionDeleted.trial_start &&
				stripeSubscriptionDeleted.trial_end
					? {
							trialStart: new Date(
								stripeSubscriptionDeleted.trial_start * 1000,
							),
							trialEnd: new Date(stripeSubscriptionDeleted.trial_end * 1000),
						}
					: {};
			await ctx.context.adapter.update({
				model: "subscription",
				where: [
					{
						field: "id",
						value: subscription.id,
					},
				],
				update: {
					...trial,
					status: "canceled",
					updatedAt: new Date(),
					cancelAtPeriodEnd: stripeSubscriptionDeleted.cancel_at_period_end,
					cancelAt: stripeSubscriptionDeleted.cancel_at
						? new Date(stripeSubscriptionDeleted.cancel_at * 1000)
						: null,
					canceledAt: stripeSubscriptionDeleted.canceled_at
						? new Date(stripeSubscriptionDeleted.canceled_at * 1000)
						: null,
					endedAt: stripeSubscriptionDeleted.ended_at
						? new Date(stripeSubscriptionDeleted.ended_at * 1000)
						: null,
					stripeScheduleId: null,
				},
			});
			await options.subscription.onSubscriptionDeleted?.({
				event,
				stripeSubscription: stripeSubscriptionDeleted,
				subscription,
			});
		} else {
			ctx.context.logger.warn(
				`Stripe webhook error: Subscription not found for subscriptionId: ${subscriptionId}`,
			);
		}
	} catch (error: any) {
		ctx.context.logger.error(`Stripe webhook failed. Error: ${error}`);
	}
}
