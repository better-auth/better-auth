import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
import { createOAuthAccountIssuer } from "@better-auth/core/db";
import { isAPIError } from "@better-auth/core/utils/is-api-error";
import type { User } from "better-auth";
import { APIError } from "better-auth/api";
import { setAccountCookie, setSessionCookie } from "better-auth/cookies";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { XMLParser } from "fast-xml-parser";
import type { FlowResult } from "samlify/types/src/flow";

import * as constants from "../constants";
import { assignOrganizationFromProvider } from "../linking";
import {
	computeSSOProviderReference,
	isCurrentSSOProviderReference,
	parseSSOProviderReference,
	SSO_PROVIDER_STATE_KEY,
} from "../provider-reference";
import {
	getSAMLPostAssertionConsumerServiceUrls,
	hasSAMLEncryptedAssertion,
	SAML_HTTP_POST_BINDING,
	validateAudience,
	validateInResponseTo,
	validateSAMLAlgorithms,
	validateSAMLResponseBinding,
	validateSingleAssertion,
	verifySAMLAssertionSignature,
} from "../saml";
import type { SAMLConditions } from "../saml/timestamp";
import { validateSAMLTimestamp } from "../saml/timestamp";
import { parseRelayState } from "../saml-state";
import { saml } from "../samlify";
import type {
	SAMLAssertionExtract,
	SAMLConfig,
	SAMLSessionRecord,
	SSOOptions,
	SSOProvider,
	SSOProviderReference,
} from "../types";
import {
	assertSSOUserResolutionAsyncContextSupport,
	assertSSOUserResolutionNativeTransactionSupport,
	assertSSOUserResolutionSessionStorage,
	getFailedSSOAuthenticationResult,
	requireSuccessfulSSOAuthentication,
	resolveSSOUser,
} from "../user-resolution";
import {
	isSafeSAMLRedirectPath,
	parseProviderEmailVerified,
	safeJsonParse,
	validateEmailDomain,
} from "../utils";
import {
	createIdP,
	createSP,
	deriveSAMLServiceProviderPolicy,
	findSAMLProvider,
} from "./helpers";
import { lockSSOProviderForAccountLink } from "./providers";

type RelayState = Awaited<ReturnType<typeof parseRelayState>>;

type IsTrustedOrigin = (
	url: string,
	settings?: { allowRelativePaths: boolean },
) => boolean;

function isSameSSOProviderReference(
	left: SSOProviderReference,
	right: SSOProviderReference,
): boolean {
	if (
		left.providerId !== right.providerId ||
		left.authenticationConfigurationFingerprint !==
			right.authenticationConfigurationFingerprint ||
		left.source.type !== right.source.type
	) {
		return false;
	}
	return left.source.type === "configured"
		? true
		: right.source.type === "persisted" &&
				left.source.recordId === right.source.recordId;
}

function getSafeRedirectCandidate(
	url: string | undefined,
	callbackPathname: string,
	appOrigin: string,
	isTrustedOrigin: IsTrustedOrigin,
): string | undefined {
	if (!url) return;

	if (url.startsWith("/")) {
		if (!isSafeSAMLRedirectPath(url)) return;
		try {
			const absoluteUrl = new URL(url, appOrigin);
			if (
				absoluteUrl.origin !== appOrigin ||
				absoluteUrl.pathname === callbackPathname
			) {
				return;
			}
			return url;
		} catch {
			return;
		}
	}

	let absoluteUrl: URL;
	try {
		absoluteUrl = new URL(url);
	} catch {
		return;
	}

	if (
		absoluteUrl.origin !== appOrigin &&
		!isTrustedOrigin(url, { allowRelativePaths: false })
	) {
		return;
	}

	// A trusted frontend can share the ACS pathname. It only loops when the
	// destination uses the auth server's own origin and callback path.
	if (
		absoluteUrl.origin === appOrigin &&
		absoluteUrl.pathname === callbackPathname
	) {
		return;
	}

	return url;
}

/**
 * Returns the first safe redirect URL from an ordered list of candidates.
 * - Prevents open redirect attacks by validating against trusted origins
 * - Prevents redirect loops by checking if URL points to callback route
 * - Tries the next candidate when a URL is invalid or unsafe
 * - Falls back to appOrigin when no candidate is safe
 */
export function getSafeRedirectUrl(
	candidates: readonly (string | undefined)[],
	callbackPath: string,
	appOrigin: string,
	isTrustedOrigin: IsTrustedOrigin,
): string {
	const callbackPathname = new URL(callbackPath).pathname;
	for (const candidate of candidates) {
		const safeCandidate = getSafeRedirectCandidate(
			candidate,
			callbackPathname,
			appOrigin,
			isTrustedOrigin,
		);
		if (safeCandidate) return safeCandidate;
	}

	return appOrigin;
}

export function buildSAMLRedirectUrl(
	url: string,
	params: Record<string, string>,
): string {
	const searchParams = new URLSearchParams(params);
	try {
		const isRelativePath = url.startsWith("/") && !url.startsWith("//");
		const parsedUrl = new URL(url, "http://better-auth.local");
		for (const [key, value] of searchParams) {
			parsedUrl.searchParams.set(key, value);
		}
		if (isRelativePath) {
			return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
		}
		return parsedUrl.toString();
	} catch {
		const hashIndex = url.indexOf("#");
		const urlWithoutFragment = hashIndex === -1 ? url : url.slice(0, hashIndex);
		const fragment = hashIndex === -1 ? "" : url.slice(hashIndex);
		const separator = urlWithoutFragment.includes("?") ? "&" : "?";
		return `${urlWithoutFragment}${separator}${searchParams.toString()}${fragment}`;
	}
}

export function getSAMLRedirectCandidates(
	relayStateCallbackUrl: string | undefined,
	samlConfig: SAMLConfig | undefined,
	samlOptions: SSOOptions["saml"] | undefined,
): readonly (string | undefined)[] {
	return [
		relayStateCallbackUrl,
		samlConfig?.idpInitiatedCallbackUrl,
		samlOptions?.idpInitiatedCallbackUrl,
		samlConfig?.callbackUrl,
	];
}

function toArray<T>(value: T | T[] | undefined): T[] {
	if (Array.isArray(value)) {
		return value;
	}
	return value ? [value] : [];
}

function getExpectedSAMLRecipients(
	config: SAMLConfig,
	baseURL: string,
	providerId: string,
	currentCallbackPath: string,
	assertionConsumerServiceUrl: string | string[] | undefined,
): string[] {
	const configuredPostAssertionConsumerServiceUrls =
		getSAMLPostAssertionConsumerServiceUrls(config.spMetadata?.metadata);

	return [
		currentCallbackPath,
		`${baseURL}/sso/saml2/sp/acs/${providerId}`,
		...configuredPostAssertionConsumerServiceUrls,
		...toArray(assertionConsumerServiceUrl),
	];
}

async function getSAMLResponseBindingContent(
	sp: ReturnType<typeof createSP>,
	samlContent: string,
): Promise<string> {
	if (!hasSAMLEncryptedAssertion(samlContent)) {
		return samlContent;
	}

	const [decryptedContent] = await saml.SamlLib.decryptAssertion(
		sp,
		samlContent,
	);
	return decryptedContent;
}

/**
 * Extracts the Assertion ID from a SAML response XML.
 * Used for replay protection per SAML 2.0 Core section 2.3.3.
 */
function extractAssertionId(samlContent: string): string | null {
	try {
		const parser = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: "@_",
			removeNSPrefix: true,
		});
		const parsed = parser.parse(samlContent);

		const response = parsed.Response || parsed["samlp:Response"];
		if (!response) return null;

		const rawAssertion = response.Assertion || response["saml:Assertion"];
		const assertion = Array.isArray(rawAssertion)
			? rawAssertion[0]
			: rawAssertion;
		if (!assertion) return null;

		return assertion["@_ID"] || null;
	} catch {
		return null;
	}
}

export interface SAMLResponseParams {
	SAMLResponse: string;
	RelayState?: string;
	providerId: string;
	currentCallbackPath: string;
	/** Receives the safe error destination after redirect context is resolved. */
	onErrorRedirectResolved?: (url: string) => void;
}

/**
 * Unified SAML response processing pipeline.
 *
 * The `/sso/saml2/sp/acs/:providerId` endpoint delegates to this function.
 * It handles the full lifecycle: provider lookup,
 * SP/IdP construction, response validation, session creation, and redirect
 * URL computation.
 */
export async function processSAMLResponse(
	ctx: any,
	params: SAMLResponseParams,
	options?: SSOOptions,
): Promise<string> {
	const { providerId, currentCallbackPath } = params;
	const appOrigin = new URL(ctx.context.baseURL).origin;

	// 1. Size validation
	const maxResponseSize =
		options?.saml?.maxResponseSize ?? constants.DEFAULT_MAX_SAML_RESPONSE_SIZE;
	if (new TextEncoder().encode(params.SAMLResponse).length > maxResponseSize) {
		throw new APIError("BAD_REQUEST", {
			message: `SAML response exceeds maximum allowed size (${maxResponseSize} bytes)`,
		});
	}

	// 2. Whitespace normalization
	const SAMLResponse = params.SAMLResponse.replace(/\s+/g, "");

	// 3. RelayState parsing
	let relayState: RelayState | null = null;
	let relayStateValidationFailed = false;
	if (params.RelayState) {
		try {
			relayState = await parseRelayState(ctx);
		} catch {
			relayStateValidationFailed = true;
		}
	}

	// 4. Provider lookup (unified: defaultSSO by providerId, then DB fallback)
	const provider: SSOProvider<SSOOptions> | null = await findSAMLProvider(
		providerId,
		options,
		ctx.context.adapter,
	);

	if (!provider?.samlConfig) {
		throw new APIError("NOT_FOUND", {
			message: "No SAML provider found",
		});
	}

	// 5. Domain verification
	if (
		options?.domainVerification?.enabled &&
		!("domainVerified" in provider && provider.domainVerified)
	) {
		throw new APIError("UNAUTHORIZED", {
			message: "Provider domain has not been verified",
		});
	}

	// 6. Config parsing
	const parsedSamlConfig =
		typeof provider.samlConfig === "object"
			? provider.samlConfig
			: safeJsonParse<SAMLConfig>(provider.samlConfig as unknown as string);

	if (!parsedSamlConfig) {
		throw new APIError("BAD_REQUEST", {
			message: "Invalid SAML configuration",
		});
	}

	// 7. SP/IdP construction via helpers
	const sp = createSP(parsedSamlConfig, ctx.context.baseURL, providerId, {
		clockSkew: options?.saml?.clockSkew,
	});
	const idp = createIdP(parsedSamlConfig);

	const redirectCandidates = getSAMLRedirectCandidates(
		relayState?.callbackURL,
		parsedSamlConfig,
		options?.saml,
	);

	const samlRedirectUrl = getSafeRedirectUrl(
		redirectCandidates,
		currentCallbackPath,
		appOrigin,
		(url: string, settings?: { allowRelativePaths: boolean }) =>
			ctx.context.isTrustedOrigin(url, settings),
	);
	const samlErrorRedirectUrl = getSafeRedirectUrl(
		[relayState?.errorURL, samlRedirectUrl],
		currentCallbackPath,
		appOrigin,
		(url: string, settings?: { allowRelativePaths: boolean }) =>
			ctx.context.isTrustedOrigin(url, settings),
	);
	params.onErrorRedirectResolved?.(samlErrorRedirectUrl);

	const stateProviderReference = parseSSOProviderReference(
		relayState?.serverContext?.[SSO_PROVIDER_STATE_KEY],
	);

	// 8. Single assertion validation
	// Throws APIError directly (not redirect) since this is a structural issue
	// with the SAMLResponse, not a flow-level error.
	validateSingleAssertion(SAMLResponse);

	// 9. Response parsing
	let parsedResponse: FlowResult;
	try {
		parsedResponse = await sp.parseLoginResponse(idp, "post", {
			body: {
				SAMLResponse,
				RelayState: params.RelayState || undefined,
			},
		});

		if (!parsedResponse?.extract) {
			throw new Error("Invalid SAML response structure");
		}
	} catch {
		ctx.context.logger.error("SAML response validation failed");
		throw new APIError("BAD_REQUEST", {
			message: "Invalid SAML response",
		});
	}

	const { extract } = parsedResponse!;
	const samlContent = parsedResponse.samlContent;

	// Destination validation (SAML Core §3.2.2) is handled by samlify's
	// parseLoginResponse, which checks the Response Destination against the
	// SP's registered ACS URL from the metadata.

	// 10. Algorithm validation
	validateSAMLAlgorithms(parsedResponse, options?.saml?.algorithms);

	// 11. Timestamp validation
	validateSAMLTimestamp((extract as SAMLAssertionExtract).conditions, {
		clockSkew: options?.saml?.clockSkew,
		requireTimestamps: options?.saml?.requireTimestamps,
		logger: ctx.context.logger,
	});

	// 11b. Response binding validation
	const expectedAudiences = [
		sp.entityMeta.getEntityID(),
		parsedSamlConfig.audience,
	];
	const assertionConsumerServiceUrl = sp.entityMeta.getAssertionConsumerService(
		SAML_HTTP_POST_BINDING,
	);
	const expectedRecipients = getExpectedSAMLRecipients(
		parsedSamlConfig,
		ctx.context.baseURL,
		providerId,
		currentCallbackPath,
		assertionConsumerServiceUrl,
	);
	const serviceProviderPolicy =
		deriveSAMLServiceProviderPolicy(parsedSamlConfig);
	let samlBindingContent: string;
	try {
		samlBindingContent = await getSAMLResponseBindingContent(sp, samlContent);
		if (serviceProviderPolicy.wantAssertionsSigned) {
			verifySAMLAssertionSignature(samlBindingContent, {
				metadata: idp.entityMeta,
				signatureAlgorithm: idp.entitySetting.requestSignatureAlgorithm,
			});
		}
		validateSAMLResponseBinding(samlBindingContent, {
			expectedAudiences,
			expectedRecipients,
		});
	} catch (error) {
		if (isAPIError(error)) {
			ctx.context.logger.error("SAML response binding validation failed", {
				providerId,
				code: error.body?.code,
			});
			throw ctx.redirect(
				buildSAMLRedirectUrl(samlErrorRedirectUrl, {
					error: "invalid_saml_response",
					error_description:
						error.body?.message || error.message || "Invalid SAML response",
				}),
			);
		}
		ctx.context.logger.error("SAML response binding validation failed", {
			providerId,
		});
		throw ctx.redirect(
			buildSAMLRedirectUrl(samlErrorRedirectUrl, {
				error: "invalid_saml_response",
				error_description: "SAML response binding could not be validated",
			}),
		);
	}

	// 12. InResponseTo validation
	const authnRequest = await validateInResponseTo(ctx, {
		extract: extract as SAMLAssertionExtract,
		providerId,
		options: {
			enableInResponseToValidation: options?.saml?.enableInResponseToValidation,
			allowIdpInitiated: options?.saml?.allowIdpInitiated,
		},
		redirectUrl: samlErrorRedirectUrl,
	});
	const requestProviderReference = authnRequest?.providerReference;
	if (relayStateValidationFailed) {
		throw ctx.redirect(
			buildSAMLRedirectUrl(samlErrorRedirectUrl, {
				error: "invalid_state",
				error_description: "invalid_or_expired_relay_state",
			}),
		);
	}
	if (relayState && !stateProviderReference) {
		throw ctx.redirect(
			buildSAMLRedirectUrl(samlErrorRedirectUrl, {
				error: "invalid_state",
				error_description: "sso_provider_reference_missing_or_invalid",
			}),
		);
	}
	if (
		stateProviderReference &&
		requestProviderReference &&
		!isSameSSOProviderReference(
			stateProviderReference,
			requestProviderReference,
		)
	) {
		throw ctx.redirect(
			buildSAMLRedirectUrl(samlErrorRedirectUrl, {
				error: "invalid_state",
				error_description: "sso_provider_reference_mismatch",
			}),
		);
	}
	const providerReference =
		stateProviderReference ??
		requestProviderReference ??
		(await computeSSOProviderReference(provider));
	if (!(await isCurrentSSOProviderReference(provider, providerReference))) {
		throw ctx.redirect(
			buildSAMLRedirectUrl(samlErrorRedirectUrl, {
				error: "invalid_state",
				error_description: "sso_provider_changed_during_authentication",
			}),
		);
	}

	// 13. Audience restriction validation
	validateAudience(ctx, {
		extract: extract as SAMLAssertionExtract,
		expectedAudience: parsedSamlConfig.audience || sp.entityMeta.getEntityID(),
		providerId,
		redirectUrl: samlErrorRedirectUrl,
	});

	// 14. Replay protection
	// Reserve the assertion id atomically: the first caller writes the tombstone
	// and proceeds, every later caller (including a concurrent submission) finds
	// the row already present and is rejected. The deterministic primary key is
	// the gate, so no separate find/expiry check is needed.
	const issuer = idp.entityMeta.getEntityID();
	const assertionId = extractAssertionId(samlBindingContent);

	if (assertionId) {
		const conditions = (extract as SAMLAssertionExtract).conditions as
			| SAMLConditions
			| undefined;
		const clockSkew =
			options?.saml?.clockSkew ?? constants.DEFAULT_CLOCK_SKEW_MS;
		const expiresAt = conditions?.notOnOrAfter
			? new Date(conditions.notOnOrAfter).getTime() + clockSkew
			: Date.now() + constants.DEFAULT_ASSERTION_TTL_MS;

		const reserved = await ctx.context.internalAdapter.reserveVerificationValue(
			{
				identifier: `${constants.USED_ASSERTION_KEY_PREFIX}${assertionId}`,
				value: JSON.stringify({
					assertionId,
					issuer,
					providerId,
					usedAt: Date.now(),
					expiresAt,
				}),
				expiresAt: new Date(expiresAt),
			},
		);

		if (!reserved) {
			ctx.context.logger.error(
				"SAML assertion replay detected: assertion ID already used",
				{ assertionId, issuer, providerId },
			);
			throw ctx.redirect(
				buildSAMLRedirectUrl(samlErrorRedirectUrl, {
					error: "replay_detected",
					error_description: "SAML assertion has already been used",
				}),
			);
		}
	} else {
		ctx.context.logger.warn(
			"Could not extract assertion ID for replay protection",
			{ providerId },
		);
	}

	// 15. User attribute extraction
	const attributes = extract.attributes || {};
	const providerAttributes: Record<string, string | readonly string[]> = {};
	for (const [name, value] of Object.entries(attributes)) {
		if (typeof value === "string") {
			providerAttributes[name] = value;
		} else if (
			Array.isArray(value) &&
			value.every((entry) => typeof entry === "string")
		) {
			providerAttributes[name] = value;
		}
	}
	const mapping = parsedSamlConfig.mapping ?? {};

	// samlify >= 2.13 types attribute values as `string | string[]` to support
	// multi-valued attributes. The identity fields below are single-valued.
	const attr = (key: string): string | undefined => {
		const value = attributes[key];
		return Array.isArray(value) ? value[0] : value;
	};

	const userInfo = {
		...Object.fromEntries(
			Object.entries(mapping.extraFields || {}).map(([key, value]) => [
				key,
				attributes[value as string],
			]),
		),
		id: extract.nameID,
		email: (
			attr(mapping.email || "email") ||
			extract.nameID ||
			""
		).toLowerCase(),
		name:
			[
				attr(mapping.firstName || "givenName"),
				attr(mapping.lastName || "surname"),
			]
				.filter(Boolean)
				.join(" ") ||
			attr(mapping.name || "displayName") ||
			extract.nameID,
		emailVerified:
			options?.trustEmailVerified && mapping.emailVerified
				? parseProviderEmailVerified(attr(mapping.emailVerified))
				: false,
	};
	if (!userInfo.id || !userInfo.email) {
		ctx.context.logger.error("Missing essential user info from SAML response", {
			providerId,
			attributeNames: Object.keys(attributes),
			hasNameId: Boolean(userInfo.id),
			hasEmail: Boolean(userInfo.email),
		});
		throw new APIError("BAD_REQUEST", {
			message: "Unable to extract user ID or email from SAML response",
		});
	}
	const providerUserAttributes = Object.fromEntries(
		Object.entries(userInfo).filter(([key]) => key !== "id"),
	);
	const providerUser = {
		...providerUserAttributes,
		email: userInfo.email as string,
		name: (userInfo.name || userInfo.email) as string,
		image:
			typeof providerUserAttributes.image === "string"
				? providerUserAttributes.image
				: undefined,
		emailVerified: userInfo.emailVerified,
	};
	const accountKey = {
		issuer,
		accountId: userInfo.id as string,
	};
	const persistedIssuer =
		ctx.context.options.account?.identityStrategy === "provider-id"
			? createOAuthAccountIssuer(provider.providerId)
			: accountKey.issuer;

	// 16. Session creation
	// SSO provider ids are user-controlled and share the social-provider account
	// namespace, so trust must come solely from verified domain ownership, never
	// from a name match against the global `trustedProviders` list (enforced via
	// `trustProviderByName: false` below).
	const isTrustedProvider: boolean =
		"domainVerified" in provider &&
		!!(provider as { domainVerified?: boolean }).domainVerified &&
		validateEmailDomain(userInfo.email as string, provider.domain);

	const callbackUrl = redirectCandidates.some(Boolean)
		? samlRedirectUrl
		: ctx.context.baseURL;
	const errorUrl = samlErrorRedirectUrl;

	let result: Awaited<ReturnType<typeof handleOAuthUserInfo>>;
	try {
		if (options?.resolveUser) {
			assertSSOUserResolutionNativeTransactionSupport(ctx.context.adapter);
			assertSSOUserResolutionSessionStorage(ctx.context.options);
			await assertSSOUserResolutionAsyncContextSupport();
		}
		result = await runWithTransaction(
			ctx.context.adapter,
			async () => {
				await lockSSOProviderForAccountLink(ctx, provider);
				const currentProvider = await findSAMLProvider(
					providerId,
					options,
					await getCurrentAdapter(ctx.context.adapter),
				);
				if (
					!currentProvider ||
					!(await isCurrentSSOProviderReference(
						currentProvider,
						providerReference,
					))
				) {
					throw new APIError("CONFLICT", {
						code: "SSO_PROVIDER_CHANGED",
						message:
							"SSO provider changed while account linking was in progress",
					});
				}
				const resolution = options?.resolveUser
					? await resolveSSOUser(
							options.resolveUser,
							{
								protocol: "saml",
								providerId: provider.providerId,
								accountKey,
								providerUser,
								providerAttributes,
								providerReference,
							},
							await getCurrentAdapter(ctx.context.adapter),
							ctx.context.logger,
						)
					: undefined;
				if (resolution?.action === "reject") {
					throw new APIError("FORBIDDEN", {
						code: resolution.code,
						...(resolution.message === undefined
							? {}
							: { message: resolution.message }),
					});
				}
				const authentication = await handleOAuthUserInfo(ctx, {
					userInfo: {
						...providerUser,
						id: userInfo.id as string,
					},
					account: {
						providerId,
						issuer: persistedIssuer,
						accountId: accountKey.accountId,
						accessToken: "",
						refreshToken: "",
					},
					callbackURL: callbackUrl,
					disableSignUp: options?.disableImplicitSignUp,
					source: {
						method: "sso-saml",
						sso: { providerId, profile: attributes },
					},
					isTrustedProvider,
					trustProviderByName: false,
					selectedUser:
						resolution?.action === "link"
							? {
									userId: resolution.userId,
									profile: resolution.profile,
								}
							: undefined,
					deferNonDatabaseWrites: !!options?.resolveUser,
					requireExactAccountBinding: !!options?.resolveUser,
				});
				return options?.resolveUser
					? requireSuccessfulSSOAuthentication(authentication)
					: authentication;
			},
			{
				onAfterCommitHookError() {
					ctx.context.logger.error(
						"Committed SSO authentication after-hook failed",
					);
				},
			},
		);
	} catch (e) {
		const failedAuthentication = getFailedSSOAuthenticationResult(e);
		if (failedAuthentication) {
			result = failedAuthentication;
		} else if (isAPIError(e) && e.body?.code) {
			throw ctx.redirect(
				buildSAMLRedirectUrl(errorUrl, {
					error: e.body.code,
					...(e.body.message ? { error_description: e.body.message } : {}),
				}),
			);
		} else {
			throw e;
		}
	}

	if (result.error) {
		throw ctx.redirect(
			buildSAMLRedirectUrl(callbackUrl, {
				error: result.error.split(" ").join("_"),
			}),
		);
	}

	const { session, user } = result.data!;

	// 17. Provision user
	if (
		options?.provisionUser &&
		(result.isRegister || options.provisionUserOnEveryLogin)
	) {
		await options.provisionUser({
			user: user as User & Record<string, any>,
			userInfo,
			provider,
		});
	}

	// 18. Organization assignment
	await assignOrganizationFromProvider(ctx as any, {
		user,
		profile: {
			providerType: "saml",
			providerId,
			accountId: userInfo.id as string,
			email: userInfo.email as string,
			emailVerified: userInfo.emailVerified,
			rawAttributes: attributes,
		},
		provider,
		provisioningOptions: options?.organizationProvisioning,
	});

	// 19. Set session cookie
	if ("accountCookie" in result && result.accountCookie) {
		await setAccountCookie(ctx, result.accountCookie);
	}
	await setSessionCookie(ctx, { session, user });

	// 20. SLO session record
	if (options?.saml?.enableSingleLogout && extract.nameID) {
		const samlSessionKey = `${constants.SAML_SESSION_KEY_PREFIX}${providerId}:${extract.nameID}`;
		const samlSessionData: SAMLSessionRecord = {
			sessionId: session.id,
			sessionToken: session.token,
			providerId,
			nameID: extract.nameID,
			sessionIndex: (extract as SAMLAssertionExtract).sessionIndex
				?.sessionIndex,
		};
		await ctx.context.internalAdapter
			.createVerificationValue({
				identifier: samlSessionKey,
				value: JSON.stringify(samlSessionData),
				expiresAt: session.expiresAt,
			})
			.catch((e: unknown) =>
				ctx.context.logger.warn("Failed to create SAML session record", {
					error: e,
				}),
			);
		await ctx.context.internalAdapter
			.createVerificationValue({
				identifier: `${constants.SAML_SESSION_BY_ID_PREFIX}${session.id}`,
				value: samlSessionKey,
				expiresAt: session.expiresAt,
			})
			.catch((e: unknown) =>
				ctx.context.logger.warn(
					"Failed to create SAML session lookup record",
					e,
				),
			);
	}

	// 20. Return precomputed safe redirect URL
	return samlRedirectUrl;
}
