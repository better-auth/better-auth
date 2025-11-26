//@ts-nocheck

import * as z from "zod";
import {
	createAuthEndpoint,
	referenceMiddleware,
	sessionMiddleware,
} from "./index";

export const restoreSubscription = createAuthEndpoint(
	"/subscription/restore",
	{
		method: "POST",
		body: z.object({
			referenceId: z
				.string({
					description: "Reference id of the subscription to restore. Eg: '123'",
				})
				.optional(),
			subscriptionId: z.string({
				description: "The id of the subscription to restore. Eg: 'sub_123'",
			}),
		}),
		use: [sessionMiddleware, referenceMiddleware("restore-subscription")],
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
		if (subscription.status != "active" && subscription.status != "trialing") {
			throw ctx.error("BAD_REQUEST", {
				message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_ACTIVE,
			});
		}
		if (!subscription.cancelAtPeriodEnd) {
			throw ctx.error("BAD_REQUEST", {
				message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION,
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
			const newSub = await client.subscriptions.update(activeSubscription.id, {
				cancel_at_period_end: false,
			});

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
