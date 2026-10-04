import type { GenericEndpointContext, StateData } from "better-auth";
import { generateGenericState, parseGenericState } from "better-auth";
import { APIError } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import {
	AUTHN_REQUEST_KEY_PREFIX,
	DEFAULT_AUTHN_REQUEST_TTL_MS,
} from "./constants";
import type { SSOProviderReference } from "./provider-reference";
import {
	computeSSOProviderReference,
	SSO_PROVIDER_STATE_KEY,
} from "./provider-reference";
import { createIdP, createSP } from "./routes/helpers";
import type {
	AuthnRequestRecord,
	SAMLConfig,
	SSOOptions,
	SSOProvider,
} from "./types";

export const SAML_FRESH_AUTHENTICATION_STATE_KEY = "samlFreshAuthentication";

type SAMLAuthenticationState = {
	callbackURL: string;
	errorCallbackURL?: string;
	newUserCallbackURL?: string;
	requestSignUp?: boolean;
};

export async function generateRelayState(
	c: GenericEndpointContext,
	link:
		| {
				email: string;
				userId: string;
		  }
		| undefined,
	providerReference?: SSOProviderReference,
	body: SAMLAuthenticationState = c.body,
	freshAuthentication = false,
) {
	const callbackURL = body.callbackURL;
	if (!callbackURL) {
		throw new APIError("BAD_REQUEST", {
			message: "callbackURL is required",
		});
	}

	const codeVerifier = generateRandomString(128);
	const stateData: StateData = {
		callbackURL,
		codeVerifier,
		errorURL: body.errorCallbackURL,
		newUserURL: body.newUserCallbackURL,
		link,
		/**
		 * This is the actual expiry time of the state
		 */
		expiresAt: Date.now() + 10 * 60 * 1000,
		requestSignUp: body.requestSignUp,
		serverContext:
			providerReference || freshAuthentication
				? {
						...(providerReference
							? { [SSO_PROVIDER_STATE_KEY]: providerReference }
							: {}),
						...(freshAuthentication
							? { [SAML_FRESH_AUTHENTICATION_STATE_KEY]: true }
							: {}),
					}
				: undefined,
	};

	try {
		return generateGenericState(c, stateData, {
			cookieName: "relay_state",
		});
	} catch (error) {
		c.context.logger.error(
			"Failed to create verification for relay state",
			error,
		);
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "State error: Unable to create verification for relay state",
			cause: error,
		});
	}
}

export async function parseRelayState(c: GenericEndpointContext) {
	const state = c.body.RelayState;
	const errorURL =
		c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;

	let parsedData: StateData;

	try {
		parsedData = await parseGenericState(c, state, {
			cookieName: "relay_state",
			/**
			 * SAML ACS receives a POST from the IdP, which is typically cross-origin.
			 * SameSite=Lax (default) cookies are not sent on cross-site POST requests.
			 */
			skipStateCookieCheck: true,
		});
	} catch (error) {
		c.context.logger.error("Failed to parse relay state", error);
		throw new APIError("BAD_REQUEST", {
			message: "State error: failed to validate relay state",
			cause: error,
		});
	}

	if (!parsedData.errorURL) {
		parsedData.errorURL = errorURL;
	}

	return parsedData;
}

/** Creates fresh RelayState and request correlation for initial and forced SAML authentication. */
export async function createSAMLAuthenticationRequest(
	ctx: GenericEndpointContext,
	provider: SSOProvider<SSOOptions>,
	config: SAMLConfig,
	options?: SSOOptions,
	body: SAMLAuthenticationState = ctx.body,
	forceAuthn = false,
) {
	const providerReference = await computeSSOProviderReference(provider);
	const { state: relayState } = await generateRelayState(
		ctx,
		undefined,
		providerReference,
		body,
		forceAuthn,
	);
	const sp = createSP(config, ctx.context.baseURL, provider.providerId, {
		relayState,
	});
	const request = sp.createLoginRequest(
		createIdP(config),
		"redirect",
		forceAuthn ? { forceAuthn: true } : undefined,
	);
	if (!request?.id)
		throw new APIError("BAD_REQUEST", { message: "Invalid SAML request" });
	if (options?.saml?.enableInResponseToValidation !== false) {
		const now = Date.now();
		const record: AuthnRequestRecord = {
			id: request.id,
			providerId: provider.providerId,
			providerReference,
			createdAt: now,
			expiresAt:
				now + (options?.saml?.requestTTL ?? DEFAULT_AUTHN_REQUEST_TTL_MS),
		};
		await ctx.context.internalAdapter.createVerificationValue({
			identifier: `${AUTHN_REQUEST_KEY_PREFIX}${record.id}`,
			value: JSON.stringify(record),
			expiresAt: new Date(record.expiresAt),
		});
	}
	return request;
}
