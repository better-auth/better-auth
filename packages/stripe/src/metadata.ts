import type Stripe from "stripe";

type CustomerInternalMetadata =
	| { customerType: "user"; userId: string }
	| { customerType: "organization"; organizationId: string };

type SubscriptionInternalMetadata = {
	userId: string;
	subscriptionId: string;
	referenceId: string;
};

const UNSAFE_METADATA_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Merge flat Stripe metadata objects, giving `internalFields` final priority.
 * Drops reserved keys that could mutate the target's prototype chain.
 */
function mergeMetadata<Internal extends Record<string, string>>(
	internalFields: Internal,
	userMetadata: (Stripe.Emptyable<Stripe.MetadataParam> | undefined)[],
): Stripe.MetadataParam {
	const merged: Stripe.MetadataParam = {};
	for (const source of userMetadata) {
		if (!source) continue;
		for (const [key, value] of Object.entries(source)) {
			if (UNSAFE_METADATA_KEYS.has(key)) continue;
			merged[key] = value;
		}
	}
	for (const [key, value] of Object.entries(internalFields)) {
		merged[key] = value;
	}
	return merged;
}

export const customerMetadata = {
	keys: {
		userId: "userId",
		organizationId: "organizationId",
		customerType: "customerType",
	} as const,

	/**
	 * Create metadata with internal fields that cannot be overridden by user metadata.
	 */
	set(
		internalFields: CustomerInternalMetadata,
		...userMetadata: (Stripe.Emptyable<Stripe.MetadataParam> | undefined)[]
	): Stripe.MetadataParam {
		return mergeMetadata(internalFields, userMetadata);
	},

	/**
	 * Extract internal fields from Stripe metadata.
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

export const subscriptionMetadata = {
	keys: {
		userId: "userId",
		subscriptionId: "subscriptionId",
		referenceId: "referenceId",
	} as const,

	/**
	 * Create metadata with internal fields that cannot be overridden by user metadata.
	 */
	set(
		internalFields: SubscriptionInternalMetadata,
		...userMetadata: (Stripe.Emptyable<Stripe.MetadataParam> | undefined)[]
	): Stripe.MetadataParam {
		return mergeMetadata(internalFields, userMetadata);
	},

	/**
	 * Extract internal fields from Stripe metadata.
	 */
	get(metadata: Stripe.Metadata | null | undefined) {
		return {
			userId: metadata?.userId,
			subscriptionId: metadata?.subscriptionId,
			referenceId: metadata?.referenceId,
		};
	},
};
