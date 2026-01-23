import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { XMLValidator } from "fast-xml-parser";
import * as saml from "samlify";
import { SAML_SESSION_BY_ID_PREFIX } from "./constants";
import { assignOrganizationByDomain } from "./linking";
import {
	requestDomainVerification,
	verifyDomain,
} from "./routes/domain-verification";
import {
	deleteSSOProvider,
	getSSOProvider,
	listSSOProviders,
	updateSSOProvider,
} from "./routes/providers";
import {
	acsEndpoint,
	callbackSSO,
	callbackSSOSAML,
	initiateSLO,
	registerSSOProvider,
	signInSSO,
	sloEndpoint,
	spMetadata,
} from "./routes/sso";

export {
	DEFAULT_CLOCK_SKEW_MS,
	DEFAULT_MAX_SAML_METADATA_SIZE,
	DEFAULT_MAX_SAML_RESPONSE_SIZE,
} from "./constants";

export {
	type SAMLConditions,
	type TimestampValidationOptions,
	validateSAMLTimestamp,
} from "./routes/sso";

export {
	type AlgorithmValidationOptions,
	DataEncryptionAlgorithm,
	type DeprecatedAlgorithmBehavior,
	DigestAlgorithm,
	KeyEncryptionAlgorithm,
	SignatureAlgorithm,
} from "./saml";

import type { OIDCConfig, SAMLConfig, SSOOptions, SSOProvider } from "./types";

export type { SAMLConfig, OIDCConfig, SSOOptions, SSOProvider };

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: AuthOptions and Options need to be same as declared in the module
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		sso: {
			creator: typeof sso;
		};
	}
}

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
	sloEndpoint: ReturnType<typeof sloEndpoint>;
	initiateSLO: ReturnType<typeof initiateSLO>;
	listSSOProviders: ReturnType<typeof listSSOProviders>;
	getSSOProvider: ReturnType<typeof getSSOProvider>;
	updateSSOProvider: ReturnType<typeof updateSSOProvider>;
	deleteSSOProvider: ReturnType<typeof deleteSSOProvider>;
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
	"/sso/saml2/sp/slo", // IdP-initiated SLO (prefix matches /sp/slo/:providerId)
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
	schema: NonNullable<BetterAuthPlugin["schema"]>;
	options: O;
};
export function sso<O extends SSOOptions>(
	options?: O | undefined,
): {
	id: "sso";
	endpoints: SSOEndpoints<O>;
};

export function sso<O extends SSOOptions>(
	options?: O | undefined,
): BetterAuthPlugin {
	const optionsWithStore = options as O;

	let endpoints = {
		spMetadata: spMetadata(optionsWithStore),
		registerSSOProvider: registerSSOProvider(optionsWithStore),
		signInSSO: signInSSO(optionsWithStore),
		callbackSSO: callbackSSO(optionsWithStore),
		callbackSSOSAML: callbackSSOSAML(optionsWithStore),
		acsEndpoint: acsEndpoint(optionsWithStore),
		sloEndpoint: sloEndpoint(optionsWithStore),
		initiateSLO: initiateSLO(optionsWithStore),
		listSSOProviders: listSSOProviders(),
		getSSOProvider: getSSOProvider(),
		updateSSOProvider: updateSSOProvider(optionsWithStore),
		deleteSSOProvider: deleteSSOProvider(),
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
		init(ctx) {
			const existing = ctx.skipOriginCheck;
			if (existing === true) {
				return {};
			}
			const existingPaths = Array.isArray(existing) ? existing : [];
			return {
				context: {
					skipOriginCheck: [...existingPaths, ...SAML_SKIP_ORIGIN_CHECK_PATHS],
				},
			};
		},
		endpoints,
		hooks: {
			before: [
				{
					matcher(context) {
						return context.path === "/sign-out";
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (!options?.saml?.enableSingleLogout) {
							return;
						}
						const session = await getSessionFromCtx(ctx);
						if (!session?.session?.id) {
							return;
						}
						const sessionLookupKey = `${SAML_SESSION_BY_ID_PREFIX}${session.session.id}`;
						const sessionLookup =
							await ctx.context.internalAdapter.findVerificationValue(
								sessionLookupKey,
							);
						if (sessionLookup?.value) {
							await ctx.context.internalAdapter
								.deleteVerificationValue(sessionLookup.value)
								.catch(() => {});
							await ctx.context.internalAdapter
								.deleteVerificationValue(sessionLookupKey)
								.catch(() => {});
						}
					}),
				},
			],
			after: [
				{
					matcher(context) {
						return context.path?.startsWith("/callback/") ?? false;
					},
					handler: createAuthMiddleware(async (ctx) => {
						const newSession = ctx.context.newSession;
						if (!newSession?.user) {
							return;
						}

						if (!ctx.context.hasPlugin("organization")) {
							return;
						}

						await assignOrganizationByDomain(ctx, {
							user: newSession.user,
							provisioningOptions: options?.organizationProvisioning,
							domainVerification: options?.domainVerification,
						});
					}),
				},
			],
		},
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
		options: options as NoInfer<O>,
	} satisfies BetterAuthPlugin;
}
