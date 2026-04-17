import type {
	BetterAuthPlugin,
	FinalizedSignIn,
	GenericEndpointContext,
	User,
} from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { symmetricDecrypt } from "better-auth/crypto";
import { XMLValidator } from "fast-xml-parser";
import * as saml from "samlify";
import {
	SAML_PENDING_SESSION_KEY_PREFIX,
	SAML_SESSION_BY_ID_PREFIX,
	SSO_PENDING_DOMAIN_ASSIGNMENT_KEY_PREFIX,
	SSO_PENDING_PROVIDER_ORG_ASSIGNMENT_KEY_PREFIX,
} from "./constants";
import {
	assignOrganizationByDomain,
	assignOrganizationFromProvider,
} from "./linking";
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
import { persistSamlSessionRecord } from "./routes/saml-pipeline";
import {
	acsEndpoint,
	callbackSSO,
	callbackSSOSAML,
	callbackSSOShared,
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

import type {
	OIDCConfig,
	PendingProviderOrganizationAssignmentRecord,
	PendingSAMLSessionRecord,
	SAMLConfig,
	SSOOptions,
	SSOProvider,
} from "./types";
import { safeJsonParse } from "./utils";
import { PACKAGE_VERSION } from "./version";

export type { SAMLConfig, OIDCConfig, SSOOptions, SSOProvider };

declare module "@better-auth/core" {
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

function isDomainAssignmentCallbackPath(path?: string | null): boolean {
	if (!path) {
		return false;
	}
	return path.startsWith("/callback/") || path.startsWith("/oauth2/callback/");
}

function getSignInAttemptExpiry(ctx: GenericEndpointContext): Date | undefined {
	return ctx.context.signInAttempt?.expiresAt;
}

async function storePendingDomainAssignment(
	ctx: GenericEndpointContext,
	attemptId: string,
	userId: string,
) {
	const expiresAt = getSignInAttemptExpiry(ctx);
	if (!expiresAt) {
		return;
	}
	await ctx.context.internalAdapter.createVerificationValue({
		identifier: `${SSO_PENDING_DOMAIN_ASSIGNMENT_KEY_PREFIX}${attemptId}`,
		value: userId,
		expiresAt,
	});
}

async function finalizePendingDomainAssignment(
	ctx: GenericEndpointContext,
	attemptId: string,
	user: User,
	options?: SSOOptions,
) {
	const pendingKey = `${SSO_PENDING_DOMAIN_ASSIGNMENT_KEY_PREFIX}${attemptId}`;
	const pendingAssignment =
		await ctx.context.internalAdapter.findVerificationValue(pendingKey);
	if (!pendingAssignment) {
		return;
	}
	if (pendingAssignment.value !== user.id) {
		await ctx.context.internalAdapter.deleteVerificationByIdentifier(
			pendingKey,
		);
		return;
	}
	await assignOrganizationByDomain(ctx, {
		user,
		provisioningOptions: options?.organizationProvisioning,
		domainVerification: options?.domainVerification,
	});
	await ctx.context.internalAdapter.deleteVerificationByIdentifier(pendingKey);
}

async function finalizePendingProviderOrganizationAssignment(
	ctx: GenericEndpointContext,
	attemptId: string,
	user: User,
	options?: SSOOptions,
) {
	const pendingKey = `${SSO_PENDING_PROVIDER_ORG_ASSIGNMENT_KEY_PREFIX}${attemptId}`;
	const pendingAssignment =
		await ctx.context.internalAdapter.findVerificationValue(pendingKey);
	if (!pendingAssignment) {
		return;
	}
	const decryptedRecord = await symmetricDecrypt({
		key: ctx.context.secretConfig,
		data: pendingAssignment.value,
	}).catch(() => null);
	const record = decryptedRecord
		? safeJsonParse<PendingProviderOrganizationAssignmentRecord>(
				decryptedRecord,
			)
		: null;
	if (!record || record.userId !== user.id) {
		await ctx.context.internalAdapter.deleteVerificationByIdentifier(
			pendingKey,
		);
		return;
	}
	const provider = await ctx.context.adapter.findOne<SSOProvider<SSOOptions>>({
		model: "ssoProvider",
		where: [{ field: "providerId", value: record.providerId }],
	});
	if (!provider) {
		await ctx.context.internalAdapter.deleteVerificationByIdentifier(
			pendingKey,
		);
		return;
	}
	await assignOrganizationFromProvider(ctx, {
		user,
		profile: record.profile,
		provider,
		token: record.token,
		provisioningOptions: options?.organizationProvisioning,
	});
	await ctx.context.internalAdapter.deleteVerificationByIdentifier(pendingKey);
}

async function finalizePendingSamlSession(
	ctx: GenericEndpointContext,
	attemptId: string,
	user: User,
	finalizedSignIn: FinalizedSignIn,
) {
	const pendingKey = `${SAML_PENDING_SESSION_KEY_PREFIX}${attemptId}`;
	const pendingSession =
		await ctx.context.internalAdapter.findVerificationValue(pendingKey);
	if (!pendingSession) {
		return;
	}
	const record = safeJsonParse<PendingSAMLSessionRecord>(pendingSession.value);
	if (!record || record.userId !== user.id || !finalizedSignIn.session.id) {
		await ctx.context.internalAdapter.deleteVerificationByIdentifier(
			pendingKey,
		);
		return;
	}
	await persistSamlSessionRecord(
		ctx,
		{
			sessionId: finalizedSignIn.session.id,
			providerId: record.providerId,
			nameID: record.nameID,
			sessionIndex: record.sessionIndex,
		},
		finalizedSignIn.session.expiresAt,
	);
	await ctx.context.internalAdapter.deleteVerificationByIdentifier(pendingKey);
}

type DomainVerificationEndpoints = {
	requestDomainVerification: ReturnType<typeof requestDomainVerification>;
	verifyDomain: ReturnType<typeof verifyDomain>;
};

type SSOEndpoints<O extends SSOOptions> = {
	spMetadata: ReturnType<typeof spMetadata>;
	registerSSOProvider: ReturnType<typeof registerSSOProvider<O>>;
	signInSSO: ReturnType<typeof signInSSO>;
	callbackSSO: ReturnType<typeof callbackSSO>;
	callbackSSOShared: ReturnType<typeof callbackSSOShared>;
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
	version: string;
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
	version: string;
	endpoints: SSOEndpoints<O> & DomainVerificationEndpoints;
	schema: NonNullable<BetterAuthPlugin["schema"]>;
	options: NoInfer<O>;
};
export function sso<O extends SSOOptions>(
	options?: O | undefined,
): {
	id: "sso";
	version: string;
	endpoints: SSOEndpoints<O>;
	options: NoInfer<O>;
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
		callbackSSOShared: callbackSSOShared(optionsWithStore),
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
		version: PACKAGE_VERSION,
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
								.deleteVerificationByIdentifier(sessionLookup.value)
								.catch(() => {});
							await ctx.context.internalAdapter
								.deleteVerificationByIdentifier(sessionLookupKey)
								.catch(() => {});
						}
					}),
				},
			],
			after: [
				{
					matcher(context) {
						return isDomainAssignmentCallbackPath(context.path);
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (!ctx.context.hasPlugin("organization")) {
							return;
						}
						const finalizedSignIn = ctx.context.finalizedSignIn;
						if (finalizedSignIn?.user) {
							await assignOrganizationByDomain(ctx, {
								user: finalizedSignIn.user,
								provisioningOptions: options?.organizationProvisioning,
								domainVerification: options?.domainVerification,
							});
							return;
						}
						const signInAttempt = ctx.context.signInAttempt;
						if (!signInAttempt?.user) {
							return;
						}
						await storePendingDomainAssignment(
							ctx,
							signInAttempt.id,
							signInAttempt.user.id,
						);
					}),
				},
				{
					matcher() {
						return true;
					},
					handler: createAuthMiddleware(async (ctx) => {
						const finalizedSignIn = ctx.context.finalizedSignIn;
						if (!finalizedSignIn?.user || !finalizedSignIn.attemptId) {
							return;
						}
						const attemptId = finalizedSignIn.attemptId;
						await finalizePendingSamlSession(
							ctx,
							attemptId,
							finalizedSignIn.user,
							finalizedSignIn,
						);
						await finalizePendingProviderOrganizationAssignment(
							ctx,
							attemptId,
							finalizedSignIn.user,
							options,
						);
						if (!ctx.context.hasPlugin("organization")) {
							return;
						}
						await finalizePendingDomainAssignment(
							ctx,
							attemptId,
							finalizedSignIn.user,
							options,
						);
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
