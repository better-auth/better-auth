import type { BetterAuthPlugin } from "better-auth";
import { XMLValidator } from "fast-xml-parser";
import * as saml from "samlify";
import type {
	AuthnRequestRecord,
	AuthnRequestStore,
} from "./authn-request-store";
import {
	createInMemoryAuthnRequestStore,
	DEFAULT_AUTHN_REQUEST_TTL_MS,
} from "./authn-request-store";
import {
	requestDomainVerification,
	verifyDomain,
} from "./routes/domain-verification";
import {
	acsEndpoint,
	callbackSSO,
	callbackSSOSAML,
	registerSSOProvider,
	signInSSO,
	spMetadata,
} from "./routes/sso";

export {
	DEFAULT_CLOCK_SKEW_MS,
	type SAMLConditions,
	type TimestampValidationOptions,
	validateSAMLTimestamp,
} from "./routes/sso";

import type { OIDCConfig, SAMLConfig, SSOOptions, SSOProvider } from "./types";

export type { SAMLConfig, OIDCConfig, SSOOptions, SSOProvider };
export type { AuthnRequestStore, AuthnRequestRecord };
export { createInMemoryAuthnRequestStore, DEFAULT_AUTHN_REQUEST_TTL_MS };

export {
	computeDiscoveryUrl,
	type DiscoverOIDCConfigParams,
	DiscoveryError,
	type DiscoveryErrorCode,
	discoverOIDCConfig,
	fetchDiscoveryDocument,
	type HydratedOIDCConfig,
	needsRuntimeDiscovery,
	normalizeDiscoveryUrls,
	normalizeUrl,
	type OIDCDiscoveryDocument,
	REQUIRED_DISCOVERY_FIELDS,
	type RequiredDiscoveryField,
	selectTokenEndpointAuthMethod,
	validateDiscoveryDocument,
	validateDiscoveryUrl,
} from "./oidc";

const fastValidator = {
	async validate(xml: string) {
		const isValid = XMLValidator.validate(xml, {
			allowBooleanAttributes: true,
		});
		if (isValid === true) return "SUCCESS_VALIDATE_XML";
		throw "ERR_INVALID_XML";
	},
};

saml.setSchemaValidator(fastValidator);

type DomainVerificationEndpoints = {
	requestDomainVerification: ReturnType<typeof requestDomainVerification>;
	verifyDomain: ReturnType<typeof verifyDomain>;
};

type SSOEndpoints<O extends SSOOptions> = {
	spMetadata: ReturnType<typeof spMetadata>;
	registerSSOProvider: ReturnType<typeof registerSSOProvider<O>>;
	signInSSO: ReturnType<typeof signInSSO>;
	callbackSSO: ReturnType<typeof callbackSSO>;
	callbackSSOSAML: ReturnType<typeof callbackSSOSAML>;
	acsEndpoint: ReturnType<typeof acsEndpoint>;
};

export type SSOPlugin<O extends SSOOptions> = {
	id: "sso";
	endpoints: SSOEndpoints<O> &
		(O extends { domainVerification: { enabled: true } }
			? DomainVerificationEndpoints
			: {});
};

/**
 * SAML endpoint paths that should skip origin check validation.
 * These endpoints receive POST requests from external Identity Providers,
 * which won't have a matching Origin header.
 */
const SAML_SKIP_ORIGIN_CHECK_PATHS = [
	"/sso/saml2/callback", // SP-initiated SSO callback (prefix matches /callback/:providerId)
	"/sso/saml2/sp/acs", // IdP-initiated SSO ACS (prefix matches /sp/acs/:providerId)
];

export function sso<
	O extends SSOOptions & {
		domainVerification?: { enabled: true };
	},
>(
	options?: O | undefined,
): {
	id: "sso";
	endpoints: SSOEndpoints<O> & DomainVerificationEndpoints;
	schema: any;
	options: O;
};
export function sso<O extends SSOOptions>(
	options?: O | undefined,
): {
	id: "sso";
	endpoints: SSOEndpoints<O>;
};

export function sso<O extends SSOOptions>(options?: O | undefined): any {
	const optionsWithStore = options as O;

	let endpoints = {
		spMetadata: spMetadata(),
		registerSSOProvider: registerSSOProvider(optionsWithStore),
		signInSSO: signInSSO(optionsWithStore),
		callbackSSO: callbackSSO(optionsWithStore),
		callbackSSOSAML: callbackSSOSAML(optionsWithStore),
		acsEndpoint: acsEndpoint(optionsWithStore),
	};

	if (options?.domainVerification?.enabled) {
		const domainVerificationEndpoints = {
			requestDomainVerification: requestDomainVerification(optionsWithStore),
			verifyDomain: verifyDomain(optionsWithStore),
		};

		endpoints = {
			...endpoints,
			...domainVerificationEndpoints,
		};
	}

	return {
		id: "sso",
		init(ctx: { skipOriginCheckForPaths?: string[] }) {
			return {
				context: {
					skipOriginCheckForPaths: [
						...(ctx.skipOriginCheckForPaths ?? []),
						...SAML_SKIP_ORIGIN_CHECK_PATHS,
					],
				},
			};
		},
		endpoints,
		schema: {
			ssoProvider: {
				modelName: options?.modelName ?? "ssoProvider",
				fields: {
					issuer: {
						type: "string",
						required: true,
						fieldName: options?.fields?.issuer ?? "issuer",
					},
					oidcConfig: {
						type: "string",
						required: false,
						fieldName: options?.fields?.oidcConfig ?? "oidcConfig",
					},
					samlConfig: {
						type: "string",
						required: false,
						fieldName: options?.fields?.samlConfig ?? "samlConfig",
					},
					userId: {
						type: "string",
						references: {
							model: "user",
							field: "id",
						},
						fieldName: options?.fields?.userId ?? "userId",
					},
					providerId: {
						type: "string",
						required: true,
						unique: true,
						fieldName: options?.fields?.providerId ?? "providerId",
					},
					organizationId: {
						type: "string",
						required: false,
						fieldName: options?.fields?.organizationId ?? "organizationId",
					},
					domain: {
						type: "string",
						required: true,
						fieldName: options?.fields?.domain ?? "domain",
					},
					...(options?.domainVerification?.enabled
						? { domainVerified: { type: "boolean", required: false } }
						: {}),
				},
			},
		},
	} satisfies BetterAuthPlugin;
}
