import type Stripe from "stripe";

/**
 * Typed Stripe object factories for tests.
 *
 * Each factory returns a value typed as the SDK shape (`Stripe.X`) so callers
 * get autocomplete and overrides are checked against the real schema. Defaults
 * cover only the fields the plugin reads; everything else is filled with
 * sensible nulls and cast at the boundary.
 *
 * When the SDK adds a required field, the cast hides it — but caller-side
 * overrides remain type-checked, which is the main guard we care about
 * (e.g., misplacing `current_period_start` at Subscription root would error).
 */

const SECONDS_30D = 30 * 24 * 60 * 60;

export function createPrice(
	overrides: Partial<Stripe.Price> = {},
): Stripe.Price {
	return {
		id: "price_mock",
		object: "price",
		active: true,
		billing_scheme: "per_unit",
		created: Math.floor(Date.now() / 1000),
		currency: "usd",
		livemode: false,
		lookup_key: null,
		metadata: {},
		nickname: null,
		product: "prod_mock",
		recurring: {
			aggregate_usage: null,
			interval: "month",
			interval_count: 1,
			meter: null,
			trial_period_days: null,
			usage_type: "licensed",
		},
		tax_behavior: "unspecified",
		tiers_mode: null,
		transform_quantity: null,
		type: "recurring",
		unit_amount: 1000,
		unit_amount_decimal: "1000",
		...overrides,
	} as Stripe.Price;
}

export function createSubscriptionItem(
	overrides: Partial<Stripe.SubscriptionItem> = {},
): Stripe.SubscriptionItem {
	const now = Math.floor(Date.now() / 1000);
	return {
		id: "si_mock",
		object: "subscription_item",
		subscription: "sub_mock",
		current_period_start: now,
		current_period_end: now + SECONDS_30D,
		quantity: 1,
		price: createPrice(),
		billing_thresholds: null,
		created: now,
		discounts: [],
		metadata: {},
		tax_rates: [],
		...overrides,
	} as Stripe.SubscriptionItem;
}

export function createSubscription(
	overrides: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
	const now = Math.floor(Date.now() / 1000);
	const item = createSubscriptionItem();
	return {
		id: "sub_mock",
		object: "subscription",
		customer: "cus_mock",
		status: "active",
		items: {
			object: "list",
			data: [item],
			has_more: false,
			url: `/v1/subscription_items?subscription=sub_mock`,
		},
		cancel_at: null,
		cancel_at_period_end: false,
		canceled_at: null,
		cancellation_details: null,
		created: now,
		discounts: [],
		ended_at: null,
		latest_invoice: null,
		livemode: false,
		metadata: {},
		schedule: null,
		start_date: now,
		trial_start: null,
		trial_end: null,
		...overrides,
	} as Stripe.Subscription;
}

function createEventBase<T extends Stripe.Event.Type>(
	type: T,
): Pick<
	Stripe.Event,
	| "id"
	| "object"
	| "api_version"
	| "created"
	| "livemode"
	| "pending_webhooks"
	| "request"
	| "type"
> {
	return {
		id: `evt_${Math.random().toString(36).slice(2, 11)}`,
		object: "event",
		api_version: "2024-12-18.acacia",
		created: Math.floor(Date.now() / 1000),
		livemode: false,
		pending_webhooks: 0,
		request: null,
		type,
	};
}

export function createSubscriptionEvent(
	type: Extract<Stripe.Event.Type, `customer.subscription.${string}`>,
	subscriptionOverrides: Partial<Stripe.Subscription> = {},
): Stripe.Event {
	return {
		...createEventBase(type),
		data: { object: createSubscription(subscriptionOverrides) },
	} as Stripe.Event;
}

export function createCheckoutSession(
	overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
	return {
		id: "cs_mock",
		object: "checkout.session",
		mode: "subscription",
		status: "complete",
		payment_status: "paid",
		customer: "cus_mock",
		subscription: "sub_mock",
		metadata: {},
		url: "https://checkout.stripe.com/mock",
		livemode: false,
		...overrides,
	} as Stripe.Checkout.Session;
}

export function createCheckoutSessionCompletedEvent(
	sessionOverrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Event {
	return {
		...createEventBase("checkout.session.completed"),
		data: { object: createCheckoutSession(sessionOverrides) },
	} as Stripe.Event;
}
