import type { User } from "../db";

type ProviderUserIdentityField = "id" | "createdAt" | "updatedAt";
type ProviderUserBaseProfile = Omit<User, ProviderUserIdentityField>;

/**
 * User attributes asserted by an external identity provider.
 *
 * The provider subject is deliberately excluded. Provider subjects identify
 * external identities; they are not Better Auth User IDs.
 * Additional mapped attributes remain available as `unknown` by default so
 * callers must validate provider-controlled claim values before using them.
 */
export type ProviderUserProfile<
	AdditionalFields extends Record<string, unknown> = Record<string, unknown>,
> = ProviderUserBaseProfile &
	Omit<
		AdditionalFields,
		keyof ProviderUserBaseProfile | ProviderUserIdentityField
	> & {
		[Field in ProviderUserIdentityField]?: never;
	};

/** Application decision for a verified provider identity. */
export type ProviderUserResolution =
	| {
			/**
			 * Use Better Auth's standard provider flow: match an existing identity,
			 * fall back to email-based account linking, then create a user when
			 * sign-up is allowed.
			 */
			action: "default";
	  }
	| {
			/** Link the verified provider identity to a specific Better Auth user. */
			action: "link";
			/** Better Auth user that owns the verified provider identity. */
			userId: string;
			/**
			 * Choose `preserve` to leave every local User field unchanged, or
			 * `provider` to apply the verified provider profile exactly for this
			 * sign-in.
			 */
			profile: "preserve" | "provider";
	  }
	| {
			/** Reject authentication before identity, account, user, or session writes. */
			action: "reject";
			/** Stable application error code returned to the caller. */
			code: string;
			/** Optional human-readable error message returned to the caller. */
			message?: string | undefined;
	  };
