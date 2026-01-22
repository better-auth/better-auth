import { defu } from "defu";
import type Stripe from "stripe";

/**
 * Internal metadata fields for Stripe Customer.
 */
type CustomerInternalMetadata =
	| { customerType: "user"; userId: string }
	| { customerType: "organization"; organizationId: string };

/**
 * Internal metadata fields for Stripe Subscription/Checkout.
 */
type SubscriptionInternalMetadata = {
	userId: string;
	subscriptionId: string;
	referenceId: string;
};

/**
 * Customer metadata - set internal fields and extract typed fields.
 */
export const customerMetadata = {
	/**
	 * Internal metadata keys for type-safe access.
	 */
	keys: {
		userId: "userId",
		organizationId: "organizationId",
		customerType: "customerType",
	} as const,

	/**
	 * Create metadata with internal fields that cannot be overridden by user metadata.
	 * Uses `defu` which prioritizes the first argument.
	 */
	set(
		internalFields: CustomerInternalMetadata,
		...userMetadata: (Stripe.Emptyable<Stripe.MetadataParam> | undefined)[]
	): Stripe.MetadataParam {
		return defu(
			internalFields as Stripe.MetadataParam,
			...userMetadata.filter(Boolean),
		);
	},

	/**
	 * Extract internal fields from Stripe metadata.
	 * Provides type-safe access to internal metadata keys.
	 */
	get(metadata: Stripe.Metadata | null | undefined) {
		return {
			userId: metadata?.userId,
			organizationId: metadata?.organizationId,
			customerType: metadata?.customerType as
				| CustomerInternalMetadata["customerType"]
				| undefined,
		};
	},
};

/**
 * Subscription/Checkout metadata - set internal fields and extract typed fields.
 */
export const subscriptionMetadata = {
	/**
	 * Internal metadata keys for type-safe access.
	 */
	keys: {
		userId: "userId",
		subscriptionId: "subscriptionId",
		referenceId: "referenceId",
	} as const,

	/**
	 * Create metadata with internal fields that cannot be overridden by user metadata.
	 * Uses `defu` which prioritizes the first argument.
	 */
	set(
		internalFields: SubscriptionInternalMetadata,
		...userMetadata: (Stripe.Emptyable<Stripe.MetadataParam> | undefined)[]
	): Stripe.MetadataParam {
		return defu(
			internalFields as Stripe.MetadataParam,
			...userMetadata.filter(Boolean),
		);
	},

	/**
	 * Extract internal fields from Stripe metadata.
	 * Provides type-safe access to internal metadata keys.
	 */
	get(metadata: Stripe.Metadata | null | undefined) {
		return {
			userId: metadata?.userId,
			subscriptionId: metadata?.subscriptionId,
			referenceId: metadata?.referenceId,
		};
	},
};
