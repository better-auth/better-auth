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

/**
 * Run a user-provided lifecycle callback on a best-effort basis.
 *
 * Callbacks run after the plugin has saved the subscription row, so a callback
 * error is logged instead of failing the webhook. Failing it would make Stripe
 * redeliver an event whose effect is already saved: callbacks that already
 * succeeded would run twice, while transition callbacks such as
 * `onSubscriptionCancel` would not run again because the saved row no longer
 * shows the transition. Errors from the plugin's own work (database reads and
 * writes, Stripe API calls) are not caught here and fail the webhook, so
 * Stripe retries it.
 * @internal
 */
async function runLifecycleHook<Args extends unknown[]>(
	ctx: GenericEndpointContext,
	event: Stripe.Event,
	name: string,
	hook: ((...args: Args) => Promise<void>) | undefined,
	...args: Args
): Promise<void> {
	if (!hook) {
		return;
	}
	try {
		await hook(...args);
	} catch (error) {
		ctx.context.logger.error(
			`Stripe webhook: ${name} failed for event ${event.id} (${event.type}). The subscription was saved and the webhook was acknowledged, so Stripe will not retry this callback.`,
			error,
		);
	}
}

/**
 * Stripe API status codes that are usually a fixable account or key setup
 * problem, or that clear on their own, so a later delivery can succeed: an
 * invalid or rotated API key (401), missing permissions (403), a missing object
 * (404: usually a key for another account, test versus live mode, a Connect
 * event retrieved without `stripeAccount`, or deleted test data), a conflicting
 * concurrent request (409) and rate limiting (429). Subscriptions canceled in
 * Stripe can still be retrieved, so a 404 rarely means the object is gone.
 * @internal
 */
const RETRYABLE_STRIPE_CLIENT_STATUS_CODES = new Set([401, 403, 404, 409, 429]);

/**
 * The fields of a `stripe` error this plugin reads.
 * @internal
 */
type StripeApiError = {
	type: string;
	statusCode?: number | undefined;
	code?: string | undefined;
};

/**
 * Whether an error came from the Stripe API. Stripe errors are recognized by
 * shape rather than `instanceof`, so the check works across the supported
 * `stripe` versions.
 * @internal
 */
function isStripeApiError(error: unknown): error is StripeApiError {
	if (!error || typeof error !== "object") {
		return false;
	}
	const { type } = error as Partial<StripeApiError>;
	return typeof type === "string" && type.startsWith("Stripe");
}

/**
 * Whether a Stripe API error will fail the same way on every retry, such as a
 * 400 for an invalid request.
 *
 * Only 4xx responses from Stripe count, minus the retryable codes above.
 * Server errors, connection errors and timeouts, and errors that don't come
 * from Stripe (a database failure, for example) are treated as transient.
 * @internal
 */
function isPermanentStripeError(error: StripeApiError): boolean {
	// Stripe can report rate limiting as a 400 with code `rate_limit`.
	if (error.type === "StripeRateLimitError") {
		return false;
	}
	const { statusCode } = error;
	return (
		typeof statusCode === "number" &&
		statusCode >= 400 &&
		statusCode < 500 &&
		!RETRYABLE_STRIPE_CLIENT_STATUS_CODES.has(statusCode)
	);
}

/**
 * Describe a failed Stripe API call with what's needed to diagnose it: the
 * event, the connected account and mode it came from, and the error.
 * @internal
 */
function describeStripeApiFailure(
	event: Stripe.Event,
	name: string,
	error: StripeApiError,
): string {
	const account = event.account ? `, account ${event.account}` : "";
	const mode = event.livemode ? "live" : "test";
	const code = error.code ? ` (${error.code})` : "";
	return `${name} failed for event ${event.id} (${event.type}, ${mode} mode${account}) with ${error.type} ${error.statusCode ?? "without a status"}${code}`;
}

/**
 * Call the Stripe API from a webhook handler. A transient failure is rethrown
 * so the webhook returns non-2xx and Stripe retries the event. A permanent one
 * is logged and resolves to `null`, so the handler can return early and Stripe
 * doesn't retry for days with no chance of success.
 * @internal
 */
async function callStripeApi<T>(
	ctx: GenericEndpointContext,
	event: Stripe.Event,
	name: string,
	call: () => Promise<T>,
): Promise<T | null> {
	try {
		return await call();
	} catch (error) {
		if (!isStripeApiError(error)) {
			throw error;
		}
		if (!isPermanentStripeError(error)) {
			ctx.context.logger.error(
				`Stripe webhook error: ${describeStripeApiFailure(event, name, error)}. The webhook will fail so Stripe retries the event.`,
			);
			throw error;
		}
		ctx.context.logger.warn(
			`Stripe webhook warning: ${describeStripeApiFailure(event, name, error)}. The subscription was not updated, and Stripe won't retry because of this error.`,
		);
		return null;
	}
}

export async function onCheckoutSessionCompleted(
	ctx: GenericEndpointContext,
	options: StripeOptions,
	event: Stripe.Event,
) {
	const client = options.stripeClient;
	const checkoutSession = event.data.object as Stripe.Checkout.Session;
	if (
		checkoutSession.mode !== "subscription" ||
		!checkoutSession.subscription ||
		!options.subscription?.enabled
	) {
		return;
	}
	const subscription = await callStripeApi(
		ctx,
		event,
		"subscriptions.retrieve",
		() => client.subscriptions.retrieve(checkoutSession.subscription as string),
	);
	if (!subscription) {
		return;
	}
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
			// The customer paid for a subscription the app has no row for, so the
			// change was not saved. Fail the webhook so the failed delivery shows
			// up in Stripe instead of being acknowledged.
			if (!dbSubscription) {
				throw new Error(
					`Subscription ${subscriptionId} not found for event ${event.id} (${event.type}), so Stripe subscription ${subscription.id} was not saved`,
				);
			}

			if (trial.trialStart) {
				await runLifecycleHook(
					ctx,
					event,
					"onTrialStart",
					plan.freeTrial?.onTrialStart,
					dbSubscription,
				);
			}

			await runLifecycleHook(
				ctx,
				event,
				"onSubscriptionComplete",
				options.subscription.onSubscriptionComplete,
				{
					event,
					subscription: dbSubscription,
					stripeSubscription: subscription,
					plan,
				},
				ctx,
			);
			return;
		}
	}
}

export async function onSubscriptionCreated(
	ctx: GenericEndpointContext,
	options: StripeOptions,
	event: Stripe.Event,
) {
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
	const existingSubscription = await ctx.context.adapter.findOne<Subscription>({
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
		stripeSubscriptionCreated.trial_start && stripeSubscriptionCreated.trial_end
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

	await runLifecycleHook(
		ctx,
		event,
		"onSubscriptionCreated",
		options.subscription.onSubscriptionCreated,
		{
			event,
			subscription: newSubscription,
			stripeSubscription: stripeSubscriptionCreated,
			plan,
		},
	);
}

export async function onSubscriptionUpdated(
	ctx: GenericEndpointContext,
	options: StripeOptions,
	event: Stripe.Event,
) {
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
			subscription = subs[0] ?? null;
		}
	}
	if (!subscription) {
		ctx.context.logger.warn(
			`Stripe webhook warning: Subscription not found for stripeSubscriptionId: ${stripeSubscriptionUpdated.id}`,
		);
		return;
	}

	const seats = plan
		? resolveQuantity(
				stripeSubscriptionUpdated.items.data,
				subscriptionItem,
				plan.seatPriceId,
			)
		: subscriptionItem.quantity;

	const trial =
		stripeSubscriptionUpdated.trial_start && stripeSubscriptionUpdated.trial_end
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
			`Stripe webhook warning: Subscription ${subscription.id} update returned no row (likely deleted concurrently) for event ${event.id} (${event.type}), Stripe subscription ${stripeSubscriptionUpdated.id}. Skipping callbacks`,
		);
		return;
	}

	const isNewCancellation =
		stripeSubscriptionUpdated.status === "active" &&
		isStripePendingCancel(stripeSubscriptionUpdated) &&
		!isPendingCancel(subscription);
	if (isNewCancellation) {
		await runLifecycleHook(
			ctx,
			event,
			"onSubscriptionCancel",
			options.subscription.onSubscriptionCancel,
			{
				event,
				subscription: subscriptionUpdated,
				stripeSubscription: stripeSubscriptionUpdated,
				cancellationDetails:
					stripeSubscriptionUpdated.cancellation_details || undefined,
			},
		);
	}
	await runLifecycleHook(
		ctx,
		event,
		"onSubscriptionUpdate",
		options.subscription.onSubscriptionUpdate,
		{
			event,
			subscription: subscriptionUpdated,
			stripeSubscription: stripeSubscriptionUpdated,
		},
	);
	if (plan) {
		if (
			stripeSubscriptionUpdated.status === "active" &&
			subscription.status === "trialing"
		) {
			await runLifecycleHook(
				ctx,
				event,
				"onTrialEnd",
				plan.freeTrial?.onTrialEnd,
				{ subscription: subscriptionUpdated },
				ctx,
			);
		}
		if (
			stripeSubscriptionUpdated.status === "incomplete_expired" &&
			subscription.status === "trialing"
		) {
			await runLifecycleHook(
				ctx,
				event,
				"onTrialExpired",
				plan.freeTrial?.onTrialExpired,
				subscriptionUpdated,
				ctx,
			);
		}
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
						trialStart: new Date(stripeSubscriptionDeleted.trial_start * 1000),
						trialEnd: new Date(stripeSubscriptionDeleted.trial_end * 1000),
					}
				: {};
		const subscriptionUpdated = await ctx.context.adapter.update<Subscription>({
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
		// Practically unreachable. A null here means the row was deleted between the read above and this update.
		if (!subscriptionUpdated) {
			ctx.context.logger.warn(
				`Stripe webhook warning: Subscription ${subscription.id} update returned no row (likely deleted concurrently) for event ${event.id} (${event.type}), Stripe subscription ${stripeSubscriptionDeleted.id}. Skipping callbacks`,
			);
			return;
		}
		await runLifecycleHook(
			ctx,
			event,
			"onSubscriptionDeleted",
			options.subscription.onSubscriptionDeleted,
			{
				event,
				stripeSubscription: stripeSubscriptionDeleted,
				subscription: subscriptionUpdated,
			},
		);
	} else {
		ctx.context.logger.warn(
			`Stripe webhook error: Subscription not found for subscriptionId: ${subscriptionId}`,
		);
	}
}
