import type { GenericEndpointContext } from "../../../types";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import { makeRedirectHandler } from "../utils/redirect";
import { formatErrorURL, getErrorURL } from "../utils/errors";

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export type ResolvedQuery = ReturnType<typeof resolveQuery>;

export function resolveQuery(
	ctx: GenericEndpointContext,
	options: ResolvedOIDCOptions,
) {
	const handleRedirect = makeRedirectHandler(ctx);
	const query = ctx.query;

	let clientId: string;
	if (typeof query?.client_id !== "string") {
		throw handleRedirect(
			getErrorURL(ctx, "invalid_client", "client_id is required"),
		);
	} else {
		clientId = query.client_id;
	}

	let redirectURI: string;
	if (typeof query?.redirect_uri !== "string") {
		throw handleRedirect(
			getErrorURL(ctx, "invalid_client", "redirect_uri is required"),
		);
	} else {
		redirectURI = query.redirect_uri;
	}

	const responseType = "code";
	if (query?.response_type !== responseType) {
		throw handleRedirect(
			getErrorURL(
				ctx,
				"unsupported_response_type",
				"unsupported response type",
			),
		);
	}

	let scope: string[];
	if (!isStringArray(query?.scope)) {
		scope = options.defaultScope.split(" ");
	} else {
		scope = query.scope;
	}

	const invalidScopes = scope.filter((s) => !options.scopes.includes(s));
	if (invalidScopes.length) {
		throw handleRedirect(
			formatErrorURL(
				redirectURI,
				"invalid_scope",
				`The following scopes are invalid: ${invalidScopes.join(", ")}`,
			),
		);
	}

	let codeChallenge:
		| { method: "plain"; challenge: string }
		| { method: "s256"; challenge: string };

	if (typeof query?.code_challenge === "string") {
		if (query?.code_challenge_method === "s256") {
			codeChallenge = { method: "s256", challenge: query.code_challenge };
		} else if (query?.code_challenge_method === "plain") {
			if (!options.allowPlainCodeChallengeMethod) {
				throw handleRedirect(
					formatErrorURL(
						redirectURI,
						"invalid_request",
						"plain code_challenge not allowed",
					),
				);
			}
			codeChallenge = { method: "plain", challenge: query.code_challenge };
		} else {
			throw handleRedirect(
				formatErrorURL(
					redirectURI,
					"invalid_request",
					"invalid code_challenge method",
				),
			);
		}
	} else {
		if (options.requirePKCE) {
			throw handleRedirect(
				formatErrorURL(redirectURI, "invalid_request", "pkce is required"),
			);
		}

		codeChallenge = { method: "plain", challenge: query.code_challenge };
	}

	let nonce: string | undefined;
	if (typeof query?.nonce == "string") {
		nonce = query.nonce;
	}

	let state: string | undefined;
	if (typeof query?.state == "string") {
		state = query.state;
	}

	let prompt: string | undefined;
	if (typeof query?.prompt == "string") {
		prompt = query.prompt;
	}

	return {
		clientId,
		redirectURI,
		responseType,
		scope,
		codeChallenge,
		nonce,
		state,
		prompt,
	};
}
