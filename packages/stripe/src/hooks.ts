import type { GenericEndpointContext } from "better-auth";
import { logger } from "better-auth";
import type Stripe from "stripe";
import type { InputSubscription, StripeOptions, Subscription } from "./types";
import { getPlanByPriceInfo } from "./utils";

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
		const priceLookupKey = subscription.items.data[0]?.price.lookup_key || null;
		const plan = await getPlanByPriceInfo(
			options,
			priceId as string,
			priceLookupKey,
		);
		if (plan) {
			const referenceId =
				checkoutSession?.client_reference_id ||
				checkoutSession?.metadata?.referenceId;
			const subscriptionId = checkoutSession?.metadata?.subscriptionId;
			const seats = subscription.items.data[0]!.quantity;
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
							periodStart: new Date(
								subscription.items.data[0]!.current_period_start * 1000,
							),
							periodEnd: new Date(
								subscription.items.data[0]!.current_period_end * 1000,
							),
							stripeSubscriptionId: checkoutSession.subscription as string,
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
		const priceId = subscriptionUpdated.items.data[0]!.price.id;
		const priceLookupKey =
			subscriptionUpdated.items.data[0]!.price.lookup_key || null;
		const plan = await getPlanByPriceInfo(options, priceId, priceLookupKey);

		const subscriptionId = subscriptionUpdated.metadata?.subscriptionId;
		const customerId = subscriptionUpdated.customer?.toString();
		let subscription = await ctx.context.adapter.findOne<Subscription>({
			model: "subscription",
			where: subscriptionId
				? [{ field: "id", value: subscriptionId }]
				: [{ field: "stripeSubscriptionId", value: subscriptionUpdated.id }],
		});
		if (!subscription) {
			const subs = await ctx.context.adapter.findMany<Subscription>({
				model: "subscription",
				where: [{ field: "stripeCustomerId", value: customerId }],
			});
			if (subs.length > 1) {
				const activeSub = subs.find(
					(sub: Subscription) =>
						sub.status === "active" || sub.status === "trialing",
				);
				if (!activeSub) {
					logger.warn(
						`Stripe webhook error: Multiple subscriptions found for customerId: ${customerId} and no active subscription is found`,
					);
					return;
				}
				subscription = activeSub;
			} else {
				subscription = subs[0]!;
			}
		}

		const seats = subscriptionUpdated.items.data[0]!.quantity;
		const updatedSubscription = await ctx.context.adapter.update<Subscription>({
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
				periodStart: new Date(
					subscriptionUpdated.items.data[0]!.current_period_start * 1000,
				),
				periodEnd: new Date(
					subscriptionUpdated.items.data[0]!.current_period_end * 1000,
				),
				cancelAtPeriodEnd: subscriptionUpdated.cancel_at_period_end,
				seats,
				stripeSubscriptionId: subscriptionUpdated.id,
			},
			where: [
				{
					field: "id",
					value: subscription.id,
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
			subscription: updatedSubscription || subscription,
		});
		if (plan) {
			if (
				subscriptionUpdated.status === "active" &&
				subscription.status === "trialing" &&
				plan.freeTrial?.onTrialEnd
			) {
				await plan.freeTrial.onTrialEnd({ subscription }, ctx);
			}
			if (
				subscriptionUpdated.status === "incomplete_expired" &&
				subscription.status === "trialing" &&
				plan.freeTrial?.onTrialExpired
			) {
				await plan.freeTrial.onTrialExpired(subscription, ctx);
			}
		}
	} catch (error: any) {
		logger.error(`Stripe webhook failed. Error: ${error}`);
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
						field: "id",
						value: subscription.id,
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
		} else {
			logger.warn(
				`Stripe webhook error: Subscription not found for subscriptionId: ${subscriptionId}`,
			);
		}
	} catch (error: any) {
		logger.error(`Stripe webhook failed. Error: ${error}`);
	}
}
