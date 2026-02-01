import type {
	GenericEndpointContext,
	InferOptionSchema,
	Session,
	User,
} from "better-auth";
import type { Organization } from "better-auth/plugins/organization";
import type Stripe from "stripe";
import type { organization, subscriptions, user } from "./schema";

export type AuthorizeReferenceAction =
	| "upgrade-subscription"
	| "list-subscription"
	| "cancel-subscription"
	| "restore-subscription"
	| "billing-portal";

export type CustomerType = "user" | "organization";

export type WithStripeCustomerId = {
	stripeCustomerId?: string;
};

// TODO: Types extended by a plugin should be moved into that plugin.
export type WithActiveOrganizationId = {
	activeOrganizationId?: string;
};

export type StripeCtxSession = {
	session: Session & WithActiveOrganizationId;
	user: User & WithStripeCustomerId;
};

export type StripePlan = {
	/**
	 * Monthly price id
	 */
	priceId?: string | undefined;
	/**
	 * To use lookup key instead of price id
	 *
	 * https://docs.stripe.com/products-prices/
	 * manage-prices#lookup-keys
	 */
	lookupKey?: string | undefined;
	/**
	 * A yearly discount price id
	 *
	 * useful when you want to offer a discount for
	 * yearly subscription
	 */
	annualDiscountPriceId?: string | undefined;
	/**
	 * To use lookup key instead of price id
	 *
	 * https://docs.stripe.com/products-prices/
	 * manage-prices#lookup-keys
	 */
	annualDiscountLookupKey?: string | undefined;
	/**
	 * Plan name
	 */
	name: string;
	/**
	 * Limits for the plan
	 *
	 * useful when you want to define plan-specific metadata.
	 */
	limits?: Record<string, unknown> | undefined;
	/**
	 * Plan group name
	 *
	 * useful when you want to group plans or
	 * when a user can subscribe to multiple plans.
	 */
	group?: string | undefined;
	/**
	 * Free trial days
	 */
	freeTrial?:
		| {
				/**
				 * Number of days
				 */
				days: number;
				/**
				 * A function that will be called when the trial
				 * starts.
				 *
				 * @param subscription
				 * @returns
				 */
				onTrialStart?: (subscription: Subscription) => Promise<void>;
				/**
				 * A function that will be called when the trial
				 * ends
				 *
				 * @param subscription - Subscription
				 * @returns
				 */
				onTrialEnd?: (
					data: {
						subscription: Subscription;
					},
					ctx: GenericEndpointContext,
				) => Promise<void>;
				/**
				 * A function that will be called when the trial
				 * expired.
				 * @param subscription - Subscription
				 * @returns
				 */
				onTrialExpired?: (
					subscription: Subscription,
					ctx: GenericEndpointContext,
				) => Promise<void>;
		  }
		| undefined;
};

export interface Subscription {
	/**
	 * Database identifier
	 */
	id: string;
	/**
	 * The plan name
	 */
	plan: string;
	/**
	 * Stripe customer id
	 */
	stripeCustomerId?: string | undefined;
	/**
	 * Stripe subscription id
	 */
	stripeSubscriptionId?: string | undefined;
	/**
	 * Trial start date
	 */
	trialStart?: Date | undefined;
	/**
	 * Trial end date
	 */
	trialEnd?: Date | undefined;
	/**
	 * Price Id for the subscription
	 */
	priceId?: string | undefined;
	/**
	 * To what reference id the subscription belongs to
	 * @example
	 * - userId for a user
	 * - workspace id for a saas platform
	 * - website id for a hosting platform
	 *
	 * @default - userId
	 */
	referenceId: string;
	/**
	 * Subscription status
	 */
	status:
		| "active"
		| "canceled"
		| "incomplete"
		| "incomplete_expired"
		| "past_due"
		| "paused"
		| "trialing"
		| "unpaid";
	/**
	 * The billing cycle start date
	 */
	periodStart?: Date | undefined;
	/**
	 * The billing cycle end date
	 */
	periodEnd?: Date | undefined;
	/**
	 * Whether this subscription will (if status=active)
	 * or did (if status=canceled) cancel at the end of the current billing period.
	 */
	cancelAtPeriodEnd?: boolean | undefined;
	/**
	 * If the subscription is scheduled to be canceled,
	 * this is the time at which the cancellation will take effect.
	 */
	cancelAt?: Date | undefined;
	/**
	 * If the subscription has been canceled, this is the time when it was canceled.
	 *
	 * Note: If the subscription was canceled with `cancel_at_period_end`,
	 * this reflects the cancellation request time, not when the subscription actually ends.
	 */
	canceledAt?: Date | undefined;
	/**
	 * If the subscription has ended, the date the subscription ended.
	 */
	endedAt?: Date | undefined;
	/**
	 * A field to group subscriptions so you can have multiple subscriptions
	 * for one reference id
	 */
	groupId?: string | undefined;
	/**
	 * Number of seats for the subscription (useful for team plans)
	 */
	seats?: number | undefined;
	/**
	 * The billing interval for this subscription.
	 * Indicates how often the subscription is billed.
	 * @see https://docs.stripe.com/api/plans/object#plan_object-interval
	 */
	billingInterval?: "day" | "week" | "month" | "year" | undefined;
}

export type SubscriptionOptions = {
	/**
	 * Subscription Configuration
	 */
	/**
	 * List of plan
	 */
	plans: StripePlan[] | (() => StripePlan[] | Promise<StripePlan[]>);
	/**
	 * Require email verification before a user is allowed to upgrade
	 * their subscriptions
	 *
	 * @default false
	 */
	requireEmailVerification?: boolean | undefined;
	/**
	 * A callback to run after a user has subscribed to a package
	 * @param event - Stripe Event
	 * @param subscription - Subscription Data
	 * @returns
	 */
	onSubscriptionComplete?:
		| ((
				data: {
					event: Stripe.Event;
					stripeSubscription: Stripe.Subscription;
					subscription: Subscription;
					plan: StripePlan;
				},
				ctx: GenericEndpointContext,
		  ) => Promise<void>)
		| undefined;
	/**
	 * A callback to run after a user is about to cancel their subscription
	 * @returns
	 */
	onSubscriptionUpdate?:
		| ((data: {
				event: Stripe.Event;
				subscription: Subscription;
		  }) => Promise<void>)
		| undefined;
	/**
	 * A callback to run after a user is about to cancel their subscription
	 * @returns
	 */
	onSubscriptionCancel?:
		| ((data: {
				event?: Stripe.Event;
				subscription: Subscription;
				stripeSubscription: Stripe.Subscription;
				cancellationDetails?: Stripe.Subscription.CancellationDetails | null;
		  }) => Promise<void>)
		| undefined;
	/**
	 * A function to check if the reference id is valid
	 * and belongs to the user
	 *
	 * @param data - data containing user, session and referenceId
	 * @param ctx - the context object
	 * @returns
	 */
	authorizeReference?:
		| ((
				data: {
					user: User & Record<string, any>;
					session: Session & Record<string, any>;
					referenceId: string;
					action: AuthorizeReferenceAction;
				},
				ctx: GenericEndpointContext,
		  ) => Promise<boolean>)
		| undefined;
	/**
	 * A callback to run after a user has deleted their subscription
	 * @returns
	 */
	onSubscriptionDeleted?:
		| ((data: {
				event: Stripe.Event;
				stripeSubscription: Stripe.Subscription;
				subscription: Subscription;
		  }) => Promise<void>)
		| undefined;
	/**
	 * A callback to run when a subscription is created
	 * @returns
	 */
	onSubscriptionCreated?:
		| ((data: {
				event: Stripe.Event;
				stripeSubscription: Stripe.Subscription;
				subscription: Subscription;
				plan: StripePlan;
		  }) => Promise<void>)
		| undefined;
	/**
	 * parameters for session create params
	 *
	 * @param data - data containing user, session and plan
	 * @param req - the request object
	 * @param ctx - the context object
	 */
	getCheckoutSessionParams?:
		| ((
				data: {
					user: User & Record<string, any>;
					session: Session & Record<string, any>;
					plan: StripePlan;
					subscription: Subscription;
				},
				req: GenericEndpointContext["request"],
				ctx: GenericEndpointContext,
		  ) =>
				| Promise<{
						params?: Stripe.Checkout.SessionCreateParams;
						options?: Stripe.RequestOptions;
				  }>
				| {
						params?: Stripe.Checkout.SessionCreateParams;
						options?: Stripe.RequestOptions;
				  })
		| undefined;
};

export interface StripeOptions {
	/**
	 * Stripe Client
	 */
	stripeClient: Stripe;
	/**
	 * Stripe Webhook Secret
	 *
	 * @description Stripe webhook secret key
	 */
	stripeWebhookSecret: string;
	/**
	 * Enable customer creation when a user signs up
	 */
	createCustomerOnSignUp?: boolean | undefined;
	/**
	 * A callback to run after a customer has been created
	 * @param customer - Customer Data
	 * @param stripeCustomer - Stripe Customer Data
	 * @returns
	 */
	onCustomerCreate?:
		| ((
				data: {
					stripeCustomer: Stripe.Customer;
					user: User & WithStripeCustomerId;
				},
				ctx: GenericEndpointContext,
		  ) => Promise<void>)
		| undefined;
	/**
	 * A custom function to get the customer create
	 * params
	 * @param data - data containing user and session
	 * @returns
	 */
	getCustomerCreateParams?:
		| ((
				user: User,
				ctx: GenericEndpointContext,
		  ) => Promise<Partial<Stripe.CustomerCreateParams>>)
		| undefined;
	/**
	 * Subscriptions
	 */
	subscription?:
		| (
				| {
						enabled: false;
				  }
				| ({
						enabled: true;
				  } & SubscriptionOptions)
		  )
		| undefined;
	/**
	 * Organization Stripe integration
	 *
	 * Enable organizations to have their own Stripe customer ID
	 */
	organization?:
		| {
				/**
				 * Enable organization Stripe customer
				 */
				enabled: true;
				/**
				 * A custom function to get the customer create params
				 * for organization customers.
				 *
				 * @param organization - the organization
				 * @param ctx - the context object
				 * @returns
				 */
				getCustomerCreateParams?:
					| ((
							organization: Organization,
							ctx: GenericEndpointContext,
					  ) => Promise<Partial<Stripe.CustomerCreateParams>>)
					| undefined;
				/**
				 * A callback to run after an organization customer has been created
				 *
				 * @param data - data containing stripeCustomer and organization
				 * @param ctx - the context object
				 * @returns
				 */
				onCustomerCreate?:
					| ((
							data: {
								stripeCustomer: Stripe.Customer;
								organization: Organization & WithStripeCustomerId;
							},
							ctx: GenericEndpointContext,
					  ) => Promise<void>)
					| undefined;
		  }
		| undefined;
	/**
	 * A callback to run after a stripe event is received
	 * @param event - Stripe Event
	 * @returns
	 */
	onEvent?: ((event: Stripe.Event) => Promise<void>) | undefined;
	/**
	 * Schema for the stripe plugin
	 */
	schema?:
		| InferOptionSchema<
				typeof subscriptions & typeof user & typeof organization
		  >
		| undefined;
}
