import type { OAuthBeforeTokenIssuanceInput } from "@better-auth/oauth-provider";
import { parseScopes } from "@better-auth/oauth-provider/internal";
import { CIBA_GRANT_TYPE } from "./constants";
import type { CibaRequest } from "./schema";

/**
 * The CIBA request a token poll redeemed, as `beforeTokenIssuance` sees it.
 * The issuance input already carries the user, client, `acr`, `amr`,
 * `act`, and authorization details; this adds what only the request knows.
 */
export interface CibaGrantRequest {
	/** The `requestId` that `sendNotification` received. */
	requestId: string;
	bindingMessage?: string | undefined;
	/**
	 * The ACR values the client requested, in order of preference. Compare
	 * them with the issuance's `acr` to require the sign-in strength the client
	 * asked for.
	 */
	acrValues?: string[] | undefined;
	/** The scopes the user approved, before the poll narrowed its resources. */
	approvedScopes: string[];
	/** The resources the user approved; the poll may narrow the token to fewer. */
	approvedResources?: string[] | undefined;
	createdAt: Date;
}

/** Builds the {@link CibaGrantRequest} the grant passes to `issueTokens`. */
export function toCibaGrantRequest(request: CibaRequest): CibaGrantRequest {
	return {
		requestId: request.id,
		bindingMessage: request.bindingMessage ?? undefined,
		acrValues: request.acrValues ?? undefined,
		approvedScopes: parseScopes(request.scope),
		approvedResources: request.resources?.length
			? request.resources
			: undefined,
		createdAt: request.createdAt,
	};
}

/**
 * During token issuance, narrows a `beforeTokenIssuance` input to the CIBA
 * request the poll redeemed. It reads `input.grantRequest` and makes no
 * database call. Returns `undefined` for an issuance from any other grant. To
 * read a pending request on your own approval page, use
 * `auth.api.getCibaRequest` instead.
 *
 * @example
 * ```ts
 * oauthProvider({
 * 	beforeTokenIssuance: (input) => {
 * 		const request = cibaGrantRequestFrom(input);
 * 		if (request?.acrValues?.length && !request.acrValues.includes(input.acr ?? "0")) {
 * 			throw new APIError("BAD_REQUEST", { error: "access_denied" });
 * 		}
 * 	},
 * });
 * ```
 */
export function cibaGrantRequestFrom(
	input: OAuthBeforeTokenIssuanceInput,
): CibaGrantRequest | undefined {
	if (input.grantType !== CIBA_GRANT_TYPE) return undefined;
	return input.grantRequest as CibaGrantRequest | undefined;
}
