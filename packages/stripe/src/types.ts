import type {
	GenericEndpointContext,
	InferOptionSchema,
	Session,
	User,
} from "better-auth";
import type Stripe from "stripe";
import type { payments, subscriptions, user } from "./schema";

export type StripePlan = {
	/**
	 * Monthly price id
	 */
	priceId?: string;
	/**
	 * To use lookup key instead of price id
	 *
	 * https://docs.stripe.com/products-prices/
	 * manage-prices#lookup-keys
	 */
	lookupKey?: string;
	/**
	 * A yearly discount price id
	 *
	 * useful when you want to offer a discount for
	 * yearly subscription
	 */
	annualDiscountPriceId?: string;
	/**
	 * To use lookup key instead of price id
	 *
	 * https://docs.stripe.com/products-prices/
	 * manage-prices#lookup-keys
	 */
	annualDiscountLookupKey?: string;
	/**
	 * Plan name
	 */
	name: string;
	/**
	 * Limits for the plan
	 */
	limits?: Record<string, number>;
	/**
	 * Plan group name
	 *
	 * useful when you want to group plans or
	 * when a user can subscribe to multiple plans.
	 */
	group?: string;
	/**
	 * Free trial days
	 */
	freeTrial?: {
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
	};
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
	stripeCustomerId?: string;
	/**
	 * Stripe subscription id
	 */
	stripeSubscriptionId?: string;
	/**
	 * Trial start date
	 */
	trialStart?: Date;
	/**
	 * Trial end date
	 */
	trialEnd?: Date;
	/**
	 * Price Id for the subscription
	 */
	priceId?: string;
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
	periodStart?: Date;
	/**
	 * The billing cycle end date
	 */
	periodEnd?: Date;
	/**
	 * Cancel at period end
	 */
	cancelAtPeriodEnd?: boolean;
	/**
	 * A field to group subscriptions so you can have multiple subscriptions
	 * for one reference id
	 */
	groupId?: string;
	/**
	 * Number of seats for the subscription (useful for team plans)
	 */
	seats?: number;
}

export type StripeProduct = {
	/**
	 * Product price id
	 */
	priceId?: string;
	/**
	 * To use lookup key instead of price id
	 *
	 * https://docs.stripe.com/products-prices/manage-prices#lookup-keys
	 */
	lookupKey?: string;
	/**
	 * Product name
	 */
	name: string;
	/**
	 * Product description
	 */
	description?: string;
	/**
	 * Product group name
	 *
	 * useful when you want to group products or
	 * categorize different types of payments
	 */
	group?: string;
	/**
	 * Product metadata
	 */
	metadata?: Record<string, any>;
	/**
	 * A callback to run after a payment is completed
	 */
	onPaymentComplete?: (
		data: {
			event: Stripe.Event;
			stripeSession: Stripe.Checkout.Session;
			payment: Payment;
			product: StripeProduct;
		},
		ctx: GenericEndpointContext,
	) => Promise<void>;
};

export interface Payment {
	/**
	 * Database identifier
	 */
	id: string;
	/**
	 * The product name
	 */
	product: string;
	/**
	 * Stripe customer id
	 */
	stripeCustomerId?: string;
	/**
	 * Stripe checkout session id
	 */
	stripeSessionId?: string;
	/**
	 * Stripe payment intent id
	 */
	stripePaymentIntentId?: string;
	/**
	 * Price Id for the payment
	 */
	priceId?: string;
	/**
	 * To what reference id the payment belongs to
	 * @example
	 * - userId for a user
	 * - workspace id for a saas platform
	 * - website id for a hosting platform
	 *
	 * @default - userId
	 */
	referenceId: string;
	/**
	 * Payment status
	 */
	status:
		| "requires_payment_method"
		| "requires_confirmation"
		| "requires_action"
		| "processing"
		| "requires_capture"
		| "canceled"
		| "succeeded";
	/**
	 * Amount paid (in cents)
	 */
	amount?: number;
	/**
	 * Currency code
	 */
	currency?: string;
	/**
	 * Additional metadata
	 */
	metadata?: string; // JSON string
}

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
	createCustomerOnSignUp?: boolean;
	/**
	 * A callback to run after a customer has been created
	 * @param customer - Customer Data
	 * @param stripeCustomer - Stripe Customer Data
	 * @returns
	 */
	onCustomerCreate?: (
		data: {
			stripeCustomer: Stripe.Customer;
			user: User & { stripeCustomerId: string };
		},
		ctx: GenericEndpointContext,
	) => Promise<void>;
	/**
	 * A custom function to get the customer create
	 * params
	 * @param data - data containing user and session
	 * @returns
	 */
	getCustomerCreateParams?: (
		user: User,
		ctx: GenericEndpointContext,
	) => Promise<Partial<Stripe.CustomerCreateParams>>;
	/**
	 * Subscriptions
	 */
	subscription?: {
		enabled: boolean;
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
		requireEmailVerification?: boolean;
		/**
		 * A callback to run after a user has subscribed to a package
		 * @param event - Stripe Event
		 * @param subscription - Subscription Data
		 * @returns
		 */
		onSubscriptionComplete?: (
			data: {
				event: Stripe.Event;
				stripeSubscription: Stripe.Subscription;
				subscription: Subscription;
				plan: StripePlan;
			},
			ctx: GenericEndpointContext,
		) => Promise<void>;
		/**
		 * A callback to run after a user is about to cancel their subscription
		 * @returns
		 */
		onSubscriptionUpdate?: (data: {
			event: Stripe.Event;
			subscription: Subscription;
		}) => Promise<void>;
		/**
		 * A callback to run after a user is about to cancel their subscription
		 * @returns
		 */
		onSubscriptionCancel?: (data: {
			event?: Stripe.Event;
			subscription: Subscription;
			stripeSubscription: Stripe.Subscription;
			cancellationDetails?: Stripe.Subscription.CancellationDetails | null;
		}) => Promise<void>;
		/**
		 * A function to check if the reference id is valid
		 * and belongs to the user
		 *
		 * @param data - data containing user, session and referenceId
		 * @param ctx - the context object
		 * @returns
		 */
		authorizeReference?: (
			data: {
				user: User & Record<string, any>;
				session: Session & Record<string, any>;
				referenceId: string;
				action: SubscriptionAction;
			},
			ctx: GenericEndpointContext,
		) => Promise<boolean>;
		/**
		 * A callback to run after a user has deleted their subscription
		 * @returns
		 */
		onSubscriptionDeleted?: (data: {
			event: Stripe.Event;
			stripeSubscription: Stripe.Subscription;
			subscription: Subscription;
		}) => Promise<void>;
		/**
		 * parameters for session create params
		 *
		 * @param data - data containing user, session and plan
		 * @param ctx - the context object
		 */
		getCheckoutSessionParams?: (
			data: {
				user: User & Record<string, any>;
				session: Session & Record<string, any>;
				plan: StripePlan;
				subscription: Subscription;
			},
			ctx: GenericEndpointContext,
		) =>
			| Promise<{
					params?: Stripe.Checkout.SessionCreateParams;
					options?: Stripe.RequestOptions;
			  }>
			| {
					params?: Stripe.Checkout.SessionCreateParams;
					options?: Stripe.RequestOptions;
			  };
		/**
		 * Enable organization subscription
		 */
		organization?: {
			enabled: boolean;
		};
	};
	/**
	 * One-time payments
	 */
	oneTimePayments?: {
		enabled: boolean;
		/**
		 * List of products available for one-time purchase
		 */
		products:
			| StripeProduct[]
			| (() => StripeProduct[] | Promise<StripeProduct[]>);
		/**
		 * Require email verification before a user is allowed to make payments
		 *
		 * @default false
		 */
		requireEmailVerification?: boolean;
		/**
		 * Default success URL for checkout sessions
		 */
		successUrl?: string;
		/**
		 * Default cancel URL for checkout sessions
		 */
		cancelUrl?: string;
		/**
		 * Allow promotion codes in checkout
		 *
		 * @default false
		 */
		allowPromotionCodes?: boolean;
		/**
		 * Enable automatic tax calculation
		 *
		 * @default false
		 */
		automaticTax?: boolean;
		/**
		 * A function to check if the reference id is valid
		 * and belongs to the user
		 */
		authorizeReference?: (
			data: {
				user: User & Record<string, any>;
				session: Session & Record<string, any>;
				referenceId: string;
				action: PaymentAction;
			},
			ctx: GenericEndpointContext,
		) => Promise<boolean>;
		/**
		 * Custom parameters for checkout session creation
		 */
		getCheckoutSessionParams?: (
			data: {
				user: User & Record<string, any>;
				session: Session & Record<string, any>;
				product: StripeProduct;
				payment: Payment;
			},
			ctx: GenericEndpointContext,
		) =>
			| Promise<{
					params?: Stripe.Checkout.SessionCreateParams;
					options?: Stripe.RequestOptions;
			  }>
			| {
					params?: Stripe.Checkout.SessionCreateParams;
					options?: Stripe.RequestOptions;
			  };
	};
	/**
	 * A callback to run after a stripe event is received
	 * @param event - Stripe Event
	 * @returns
	 */
	onEvent?: (event: Stripe.Event) => Promise<void>;
	/**
	 * Schema for the stripe plugin
	 */
	schema?: InferOptionSchema<
		typeof subscriptions & typeof user & typeof payments
	>; // Add payments here
}

export type SubscriptionAction =
	| "upgrade-subscription"
	| "list-subscription"
	| "cancel-subscription"
	| "restore-subscription"
	| "billing-portal";
export type PaymentAction = "create-payment" | "view-payment" | "list-payments";

export interface InputSubscription extends Omit<Subscription, "id"> {}
export interface InputPayment extends Omit<Payment, "id"> {}
