import type { GenericEndpointContext } from "@better-auth/core";
import type {
	OAuth2Tokens,
	OAuth2UserInfo,
	OAuthProvider,
} from "@better-auth/core/oauth2";

/**
 * Account columns Better Auth owns. A provider's `getAccountFields` can never
 * write them, so the hook cannot rebind an account or replace its tokens.
 */
const RESERVED_ACCOUNT_FIELDS: ReadonlySet<string> = new Set([
	"id",
	"userId",
	"providerId",
	"accountId",
	"accessToken",
	"refreshToken",
	"idToken",
	"accessTokenExpiresAt",
	"refreshTokenExpiresAt",
	"scope",
	"password",
	"createdAt",
	"updatedAt",
]);

/**
 * Runs the provider's `getAccountFields` hook and returns the values that may
 * be stored on the provider account, or `undefined` when there is nothing to
 * store. The hook is not called when the provider does not set it.
 *
 * The values come from the provider, so they follow the same rule as
 * `mapProfileToUser` values for user fields: a field marked `input: false`
 * stays server-owned and the provider cannot set it.
 */
export async function resolveOAuthAccountFields(
	c: GenericEndpointContext,
	provider: OAuthProvider,
	tokens: OAuth2Tokens,
	userInfo: OAuth2UserInfo,
): Promise<Record<string, unknown> | undefined> {
	const getAccountFields = provider.options?.getAccountFields;
	if (!getAccountFields) {
		return undefined;
	}
	const fields = await getAccountFields(tokens, userInfo);
	if (!fields) {
		return undefined;
	}
	const declaredFields = c.context.tables.account?.fields ?? {};
	const accepted = Object.entries(fields).filter(
		([key, value]) =>
			value !== undefined &&
			!RESERVED_ACCOUNT_FIELDS.has(key) &&
			Object.hasOwn(declaredFields, key) &&
			declaredFields[key]?.input !== false,
	);
	return accepted.length > 0 ? Object.fromEntries(accepted) : undefined;
}
