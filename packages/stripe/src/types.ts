import type {
	GenericEndpointContext,
	InferOptionSchema,
	Session,
	User,
} from "better-auth";
import type Stripe from "stripe";
import type { subscriptions, user } from "./schema";

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
	 * Cancel at period end
	 */
	cancelAtPeriodEnd?: boolean | undefined;
	/**
	 * A field to group subscriptions so you can have multiple subscriptions
	 * for one reference id
	 */
	groupId?: string | undefined;
	/**
	 * Number of seats for the subscription (useful for team plans)
	 */
	seats?: number | undefined;
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
					action:
						| "upgrade-subscription"
						| "list-subscription"
						| "cancel-subscription"
						| "restore-subscription"
						| "billing-portal";
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
	/**
	 * Enable organization subscription
	 */
	organization?:
		| {
				enabled: boolean;
		  }
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
					user: User & { stripeCustomerId: string };
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
	 * A callback to run after a stripe event is received
	 * @param event - Stripe Event
	 * @returns
	 */
	onEvent?: ((event: Stripe.Event) => Promise<void>) | undefined;
	/**
	 * Schema for the stripe plugin
	 */
	schema?: InferOptionSchema<typeof subscriptions & typeof user> | undefined;
}

export interface InputSubscription extends Omit<Subscription, "id"> {}
