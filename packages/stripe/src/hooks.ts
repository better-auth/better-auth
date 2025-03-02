import { logger, type GenericEndpointContext, type User } from "better-auth";
import type Stripe from "stripe";
import type { InputSubscription, StripeOptions, Subscription } from "./types";
import { getPlanByPriceId } from "./utils";

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
		const priceId = subscription.items.data[0]?.price.id;
		const plan = await getPlanByPriceId(options, priceId as string);
		if (plan) {
			const referenceId = checkoutSession?.metadata?.referenceId;
			const subscriptionId = checkoutSession?.metadata?.subscriptionId;
			const seats = subscription.items.data[0].quantity;
			if (referenceId && subscriptionId) {
				const trial =
					subscription.trial_start && subscription.trial_end
						? {
								trialStart: new Date(subscription.trial_start * 1000),
								trialEnd: new Date(subscription.trial_end * 1000),
							}
						: {};

				let dbSubscription =
					await ctx.context.adapter.update<InputSubscription>({
						model: "subscription",
						update: {
							plan: plan.name.toLowerCase(),
							status: subscription.status,
							updatedAt: new Date(),
							periodStart: new Date(subscription.current_period_start * 1000),
							periodEnd: new Date(subscription.current_period_end * 1000),
							seats,
							...trial,
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
				await options.subscription?.onSubscriptionComplete?.({
					event,
					subscription: dbSubscription as Subscription,
					stripeSubscription: subscription,
					plan,
				});
				return;
			}
		}
	} catch (e: any) {
		logger.error(`Stripe webhook failed. Error: ${e.message}`);
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
		const subscriptionUpdated = event.data.object as Stripe.Subscription;
		const priceId = subscriptionUpdated.items.data[0].price.id;
		const plan = await getPlanByPriceId(options, priceId);
		const stripeId = subscriptionUpdated.id;
		const subscription = await ctx.context.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "stripeSubscriptionId",
					value: stripeId,
				},
			],
		});
		if (!subscription) {
			return;
		}
		const seats = subscriptionUpdated.items.data[0].quantity;
		await ctx.context.adapter.update({
			model: "subscription",
			update: {
				...(plan
					? {
							plan: plan.name.toLowerCase(),
							limits: plan.limits,
						}
					: {}),
				updatedAt: new Date(),
				status: subscriptionUpdated.status,
				periodStart: new Date(subscriptionUpdated.current_period_start * 1000),
				periodEnd: new Date(subscriptionUpdated.current_period_end * 1000),
				cancelAtPeriodEnd: subscriptionUpdated.cancel_at_period_end,
				seats,
			},
			where: [
				{
					field: "stripeSubscriptionId",
					value: subscriptionUpdated.id,
				},
			],
		});
		const subscriptionCanceled =
			subscriptionUpdated.status === "active" &&
			subscriptionUpdated.cancel_at_period_end &&
			!subscription.cancelAtPeriodEnd; //if this is true, it means the subscription was canceled before the event was triggered
		if (subscriptionCanceled) {
			await options.subscription.onSubscriptionCancel?.({
				subscription,
				cancellationDetails:
					subscriptionUpdated.cancellation_details || undefined,
				stripeSubscription: subscriptionUpdated,
				event,
			});
		}
		await options.subscription.onSubscriptionUpdate?.({
			event,
			subscription,
		});
		if (plan) {
			if (
				subscriptionUpdated.status === "active" &&
				subscription.status === "trialing" &&
				plan.freeTrial?.onTrialEnd
			) {
				const user = await ctx.context.adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: subscription.referenceId }],
				});
				if (user) {
					await plan.freeTrial.onTrialEnd({ subscription, user }, ctx.request);
				}
			}
			if (
				subscriptionUpdated.status === "incomplete_expired" &&
				subscription.status === "trialing" &&
				plan.freeTrial?.onTrialExpired
			) {
				await plan.freeTrial.onTrialExpired(subscription, ctx.request);
			}
		}
	} catch (error: any) {
		logger.error(`Stripe webhook failed. Error: ${error.message}`);
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
		const subscriptionDeleted = event.data.object as Stripe.Subscription;
		const subscriptionId = subscriptionDeleted.id;
		if (subscriptionDeleted.status === "canceled") {
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
				await ctx.context.adapter.update({
					model: "subscription",
					where: [
						{
							field: "stripeSubscriptionId",
							value: subscriptionId,
						},
					],
					update: {
						status: "canceled",
						updatedAt: new Date(),
					},
				});
				await options.subscription.onSubscriptionDeleted?.({
					event,
					stripeSubscription: subscriptionDeleted,
					subscription,
				});
			}
		}
	} catch (error: any) {
		logger.error(`Stripe webhook failed. Error: ${error.message}`);
	}
}
