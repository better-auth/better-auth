import * as z from "zod";
import type { Prettify } from "../../types";
import type { BetterAuthOptions } from "../../types/init-options";
import type {
	InferDBFieldsFromOptions,
	InferDBFieldsFromPlugins,
} from "../type";
import { coreSchema } from "./shared";

export const accountSchema = coreSchema.extend({
	providerId: z.string(),
	issuer: z.string().optional(),
	accountId: z.string(),
	userId: z.coerce.string(),
	accessToken: z.string().nullish(),
	refreshToken: z.string().nullish(),
	idToken: z.string().nullish(),
	/**
	 * Access token expires at
	 */
	accessTokenExpiresAt: z.date().nullish(),
	/**
	 * Refresh token expires at
	 */
	refreshTokenExpiresAt: z.date().nullish(),
	/**
	 * The set of OAuth scopes the user has granted to this account, stored
	 * as a comma-separated list. Represents the accumulated grant rather
	 * than the latest token's `scope` claim, since per RFC 6749 Section 1.5 a
	 * token's scope may be narrower than the user's grant.
	 */
	scope: z.string().nullish(),
	/**
	 * Password is only stored in the credential provider
	 */
	password: z.string().nullish(),
});

export type BaseAccount = z.infer<typeof accountSchema>;

/** The stable provider-side key used to recognize an account. */
export type AccountKey = Readonly<
	| {
			providerId: string;
			accountId: string;
			issuer?: never;
	  }
	| {
			issuer: string;
			accountId: string;
			providerId?: never;
	  }
>;

export type AccountIdentityStrategy = "provider-id" | "issuer";

type AccountIdentityInput = Readonly<{
	providerId: string;
	accountId: string;
	issuer?: string | undefined;
}>;

type ResolvedAccountIdentity = Readonly<
	| {
			key: Extract<AccountKey, { providerId: string }>;
			fields: {
				providerId: string;
				accountId: string;
			};
	  }
	| {
			key: Extract<AccountKey, { issuer: string }>;
			fields: {
				providerId: string;
				accountId: string;
				issuer: string;
			};
	  }
>;

/**
 * Resolves the account lookup key and database fields for the selected
 * identity strategy. An omitted strategy preserves v1.6 provider identity.
 */
export function resolveAccountIdentity(
	identityStrategy: AccountIdentityStrategy | undefined,
	input: AccountIdentityInput,
): ResolvedAccountIdentity {
	if (identityStrategy !== "issuer") {
		return {
			key: { providerId: input.providerId, accountId: input.accountId },
			fields: { providerId: input.providerId, accountId: input.accountId },
		};
	}
	if (
		input.issuer === undefined ||
		input.issuer.trim().length === 0 ||
		input.issuer === "undefined" ||
		input.issuer === "null"
	) {
		throw new Error("Issuer-scoped account identity requires a valid issuer");
	}
	return {
		key: { issuer: input.issuer, accountId: input.accountId },
		fields: {
			providerId: input.providerId,
			accountId: input.accountId,
			issuer: input.issuer,
		},
	};
}

function encodeAccountIssuerProviderId(providerId: string): string {
	return encodeURIComponent(providerId);
}

/**
 * Creates the synthetic issuer used by providers without an issuer of their own.
 */
export function createLocalAccountIssuer(providerId: string): string {
	return `local:${encodeAccountIssuerProviderId(providerId)}`;
}

/**
 * Creates the synthetic issuer used by OAuth providers without an issuer of
 * their own. OAuth identities use a distinct namespace so a provider ID
 * cannot collide with an internal local authentication method.
 */
export function createOAuthAccountIssuer(providerId: string): string {
	return `local:oauth:${encodeAccountIssuerProviderId(providerId)}`;
}

/**
 * Account schema type used by better-auth, note that it's possible that account could have additional fields
 */
export type Account<
	DBOptions extends BetterAuthOptions["account"] = BetterAuthOptions["account"],
	Plugins extends BetterAuthOptions["plugins"] = BetterAuthOptions["plugins"],
> = Prettify<
	Omit<BaseAccount, "issuer"> &
		(NonNullable<DBOptions> extends { identityStrategy: "issuer" }
			? { issuer: string }
			: { issuer?: string }) &
		InferDBFieldsFromOptions<DBOptions> &
		InferDBFieldsFromPlugins<"account", Plugins>
>;
