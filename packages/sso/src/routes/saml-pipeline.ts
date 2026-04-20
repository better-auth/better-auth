import type { GenericEndpointContext, User } from "better-auth";
import { amrForProvider } from "better-auth";
import { APIError } from "better-auth/api";
import { resolveSignInWithRedirect } from "better-auth/auth/resolve-sign-in";
import { symmetricEncrypt } from "better-auth/crypto";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { XMLParser } from "fast-xml-parser";
import type { FlowResult } from "samlify/types/src/flow";

import * as constants from "../constants";
import { assignOrganizationFromProvider } from "../linking";
import { validateSAMLAlgorithms, validateSingleAssertion } from "../saml";
import type { SAMLConditions } from "../saml/timestamp";
import { validateSAMLTimestamp } from "../saml/timestamp";
import { parseRelayState } from "../saml-state";
import type {
	AuthnRequestRecord,
	PendingSAMLSessionRecord,
	SAMLAssertionExtract,
	SAMLConfig,
	SAMLSessionRecord,
	SSOOptions,
	SSOProvider,
} from "../types";
import {
	normalizeSamlSessionIndex,
	safeJsonParse,
	validateEmailDomain,
} from "../utils";
import { createIdP, createSP, findSAMLProvider } from "./helpers";

type RelayState = Awaited<ReturnType<typeof parseRelayState>>;

/**
 * Validates and returns a safe redirect URL.
 * - Prevents open redirect attacks by validating against trusted origins
 * - Prevents redirect loops by checking if URL points to callback route
 * - Falls back to appOrigin if URL is invalid or unsafe
 */
export function getSafeRedirectUrl(
	url: string | undefined,
	callbackPath: string,
	appOrigin: string,
	isTrustedOrigin: (
		url: string,
		settings?: { allowRelativePaths: boolean },
	) => boolean,
): string {
	if (!url) {
		return appOrigin;
	}

	if (url.startsWith("/") && !url.startsWith("//")) {
		try {
			const absoluteUrl = new URL(url, appOrigin);
			if (absoluteUrl.origin !== appOrigin) {
				return appOrigin;
			}
			const callbackPathname = new URL(callbackPath).pathname;
			if (absoluteUrl.pathname === callbackPathname) {
				return appOrigin;
			}
		} catch {
			return appOrigin;
		}
		return url;
	}

	if (!isTrustedOrigin(url, { allowRelativePaths: false })) {
		return appOrigin;
	}

	try {
		const callbackPathname = new URL(callbackPath).pathname;
		const urlPathname = new URL(url).pathname;
		if (urlPathname === callbackPathname) {
			return appOrigin;
		}
	} catch {
		if (url === callbackPath || url.startsWith(`${callbackPath}?`)) {
			return appOrigin;
		}
	}

	return url;
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

export async function persistSamlSessionRecord(
	ctx: GenericEndpointContext,
	record: SAMLSessionRecord,
	expiresAt: Date,
) {
	const samlSessionKey = `${constants.SAML_SESSION_KEY_PREFIX}${record.providerId}:${record.nameID}`;
	await ctx.context.internalAdapter
		.createVerificationValue({
			identifier: samlSessionKey,
			value: JSON.stringify(record),
			expiresAt,
		})
		.catch((e: unknown) =>
			ctx.context.logger.warn("Failed to create SAML session record", {
				error: e,
			}),
		);
	await ctx.context.internalAdapter
		.createVerificationValue({
			identifier: `${constants.SAML_SESSION_BY_ID_PREFIX}${record.sessionId}`,
			value: samlSessionKey,
			expiresAt,
		})
		.catch((e: unknown) =>
			ctx.context.logger.warn("Failed to create SAML session lookup record", e),
		);
}

async function storePendingSamlSessionRecord(
	ctx: GenericEndpointContext,
	attemptId: string,
	record: PendingSAMLSessionRecord,
	expiresAt: Date,
) {
	await ctx.context.internalAdapter
		.createVerificationValue({
			identifier: `${constants.SAML_PENDING_SESSION_KEY_PREFIX}${attemptId}`,
			value: JSON.stringify(record),
			expiresAt,
		})
		.catch((e: unknown) =>
			ctx.context.logger.warn("Failed to store pending SAML session record", {
				error: e,
			}),
		);
}

export interface SAMLResponseParams {
	SAMLResponse: string;
	RelayState?: string;
	providerId: string;
	currentCallbackPath: string;
}

/**
 * Unified SAML response processing pipeline.
 *
 * Both `/sso/saml2/callback/:providerId` (POST) and `/sso/saml2/sp/acs/:providerId`
 * delegate to this function. It handles the full lifecycle: provider lookup,
 * SP/IdP construction, response validation, session creation, and redirect
 * URL computation.
 */
export async function processSAMLResponse(
	ctx: GenericEndpointContext,
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
	if (params.RelayState) {
		try {
			relayState = await parseRelayState(ctx);
		} catch {
			relayState = null;
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
	const sp = createSP(parsedSamlConfig, ctx.context.baseURL, providerId);
	const idp = createIdP(parsedSamlConfig);

	const samlRedirectUrl = getSafeRedirectUrl(
		relayState?.callbackURL || parsedSamlConfig.callbackUrl,
		params.currentCallbackPath,
		appOrigin,
		(url: string, settings?: { allowRelativePaths: boolean }) =>
			ctx.context.isTrustedOrigin(url, settings),
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
	} catch (error) {
		ctx.context.logger.error("SAML response validation failed", {
			error,
			samlResponsePreview: SAMLResponse.slice(0, 200),
		});
		throw new APIError("BAD_REQUEST", {
			message: "Invalid SAML response",
			details: error instanceof Error ? error.message : String(error),
		});
	}

	const { extract } = parsedResponse!;

	// 10. Algorithm validation
	validateSAMLAlgorithms(parsedResponse, options?.saml?.algorithms);

	// 11. Timestamp validation
	validateSAMLTimestamp((extract as SAMLAssertionExtract).conditions, {
		clockSkew: options?.saml?.clockSkew,
		requireTimestamps: options?.saml?.requireTimestamps,
		logger: ctx.context.logger,
	});

	// 12. InResponseTo validation
	const inResponseTo = (extract as SAMLAssertionExtract).inResponseTo as
		| string
		| undefined;
	const shouldValidateInResponseTo =
		options?.saml?.enableInResponseToValidation !== false;

	if (shouldValidateInResponseTo) {
		const allowIdpInitiated = options?.saml?.allowIdpInitiated !== false;

		if (inResponseTo) {
			let storedRequest: AuthnRequestRecord | null = null;

			const verification =
				await ctx.context.internalAdapter.findVerificationValue(
					`${constants.AUTHN_REQUEST_KEY_PREFIX}${inResponseTo}`,
				);
			if (verification) {
				try {
					storedRequest = JSON.parse(verification.value) as AuthnRequestRecord;
					if (storedRequest && storedRequest.expiresAt < Date.now()) {
						storedRequest = null;
					}
				} catch {
					storedRequest = null;
				}
			}

			if (!storedRequest) {
				ctx.context.logger.error(
					"SAML InResponseTo validation failed: unknown or expired request ID",
					{ inResponseTo, providerId },
				);
				throw ctx.redirect(
					`${samlRedirectUrl}?error=invalid_saml_response&error_description=Unknown+or+expired+request+ID`,
				);
			}

			if (storedRequest.providerId !== providerId) {
				ctx.context.logger.error(
					"SAML InResponseTo validation failed: provider mismatch",
					{
						inResponseTo,
						expectedProvider: storedRequest.providerId,
						actualProvider: providerId,
					},
				);
				await ctx.context.internalAdapter.deleteVerificationByIdentifier(
					`${constants.AUTHN_REQUEST_KEY_PREFIX}${inResponseTo}`,
				);
				throw ctx.redirect(
					`${samlRedirectUrl}?error=invalid_saml_response&error_description=Provider+mismatch`,
				);
			}

			await ctx.context.internalAdapter.deleteVerificationByIdentifier(
				`${constants.AUTHN_REQUEST_KEY_PREFIX}${inResponseTo}`,
			);
		} else if (!allowIdpInitiated) {
			ctx.context.logger.error(
				"SAML IdP-initiated SSO rejected: InResponseTo missing and allowIdpInitiated is false",
				{ providerId },
			);
			throw ctx.redirect(
				`${samlRedirectUrl}?error=unsolicited_response&error_description=IdP-initiated+SSO+not+allowed`,
			);
		}
	}

	// 13. Replay protection
	const samlContent = (parsedResponse as any).samlContent as string | undefined;
	const assertionId = samlContent ? extractAssertionId(samlContent) : null;

	if (assertionId) {
		const issuer = idp.entityMeta.getEntityID();
		const conditions = (extract as SAMLAssertionExtract).conditions as
			| SAMLConditions
			| undefined;
		const clockSkew =
			options?.saml?.clockSkew ?? constants.DEFAULT_CLOCK_SKEW_MS;
		const expiresAt = conditions?.notOnOrAfter
			? new Date(conditions.notOnOrAfter).getTime() + clockSkew
			: Date.now() + constants.DEFAULT_ASSERTION_TTL_MS;

		const existingAssertion =
			await ctx.context.internalAdapter.findVerificationValue(
				`${constants.USED_ASSERTION_KEY_PREFIX}${assertionId}`,
			);

		let isReplay = false;
		if (existingAssertion) {
			try {
				const stored = JSON.parse(existingAssertion.value);
				if (stored.expiresAt >= Date.now()) {
					isReplay = true;
				}
			} catch (error) {
				ctx.context.logger.warn("Failed to parse stored assertion record", {
					assertionId,
					error,
				});
			}
		}

		if (isReplay) {
			ctx.context.logger.error(
				"SAML assertion replay detected: assertion ID already used",
				{ assertionId, issuer, providerId },
			);
			throw ctx.redirect(
				`${samlRedirectUrl}?error=replay_detected&error_description=SAML+assertion+has+already+been+used`,
			);
		}

		await ctx.context.internalAdapter.createVerificationValue({
			identifier: `${constants.USED_ASSERTION_KEY_PREFIX}${assertionId}`,
			value: JSON.stringify({
				assertionId,
				issuer,
				providerId,
				usedAt: Date.now(),
				expiresAt,
			}),
			expiresAt: new Date(expiresAt),
		});
	} else {
		ctx.context.logger.warn(
			"Could not extract assertion ID for replay protection",
			{ providerId },
		);
	}

	// 14. User attribute extraction
	const attributes = extract.attributes || {};
	const mapping = parsedSamlConfig.mapping ?? {};

	const userInfo = {
		...Object.fromEntries(
			Object.entries(mapping.extraFields || {}).map(([key, value]) => [
				key,
				attributes[value as string],
			]),
		),
		id: attributes[mapping.id || "nameID"] || extract.nameID,
		email: (
			attributes[mapping.email || "email"] || extract.nameID
		).toLowerCase(),
		name:
			[
				attributes[mapping.firstName || "givenName"],
				attributes[mapping.lastName || "surname"],
			]
				.filter(Boolean)
				.join(" ") ||
			attributes[mapping.name || "displayName"] ||
			extract.nameID,
		emailVerified:
			options?.trustEmailVerified && mapping.emailVerified
				? ((attributes[mapping.emailVerified] || false) as boolean)
				: false,
	};
	if (!userInfo.id || !userInfo.email) {
		ctx.context.logger.error("Missing essential user info from SAML response", {
			attributes: Object.keys(attributes),
			mapping,
			extractedId: userInfo.id,
			extractedEmail: userInfo.email,
		});
		throw new APIError("BAD_REQUEST", {
			message: "Unable to extract user ID or email from SAML response",
		});
	}

	// 15. Session creation
	const isTrustedProvider: boolean =
		ctx.context.trustedProviders.includes(providerId) ||
		("domainVerified" in provider &&
			!!(provider as { domainVerified?: boolean }).domainVerified &&
			validateEmailDomain(userInfo.email as string, provider.domain));

	// TODO: split callbackUrl into separate ACS URL and post-auth redirect
	// fields. Currently callbackUrl serves both purposes, which means
	// IdP-initiated flows (no RelayState) fall back to either a URL that may be
	// the ACS endpoint (blocked by loop protection) or baseURL.
	const callbackUrl =
		relayState?.callbackURL ||
		parsedSamlConfig.callbackUrl ||
		ctx.context.baseURL;

	const result = await handleOAuthUserInfo(ctx, {
		userInfo: {
			email: userInfo.email as string,
			name: (userInfo.name || userInfo.email) as string,
			id: userInfo.id as string,
			emailVerified: Boolean(userInfo.emailVerified),
		},
		account: {
			providerId,
			accountId: userInfo.id as string,
			accessToken: "",
			refreshToken: "",
		},
		callbackURL: callbackUrl,
		disableSignUp: options?.disableImplicitSignUp,
		isTrustedProvider,
	});

	if (result.error) {
		throw ctx.redirect(
			`${callbackUrl}?error=${result.error.split(" ").join("_")}`,
		);
	}

	const user = result.data!;
	const sessionIndex = normalizeSamlSessionIndex(
		(extract as SAMLAssertionExtract).sessionIndex as
			| string
			| string[]
			| undefined,
	);

	// 16. Provision user
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
	const providerOrganizationAssignment = {
		user,
		profile: {
			providerType: "saml" as const,
			providerId,
			accountId: userInfo.id as string,
			email: userInfo.email as string,
			emailVerified: Boolean(userInfo.emailVerified),
			rawAttributes: attributes,
		},
		provider,
		provisioningOptions: options?.organizationProvisioning,
	};

	const failedToCreateSessionRedirectUrl = getSafeRedirectUrl(
		relayState?.errorURL ||
			relayState?.callbackURL ||
			parsedSamlConfig.callbackUrl,
		currentCallbackPath,
		appOrigin,
		(url: string, settings?: { allowRelativePaths: boolean }) =>
			ctx.context.isTrustedOrigin(url, settings),
	);

	// 18. Finalize or challenge the sign-in before issuing auth cookies
	await resolveSignInWithRedirect(ctx, {
		signIn: {
			user,
			amr: amrForProvider(providerId),
		},
		redirectTarget: samlRedirectUrl,
		onFailedToCreateSession() {
			throw ctx.redirect(
				`${failedToCreateSessionRedirectUrl}?error=failed_to_create_session`,
			);
		},
		onChallenge: async (challenge) => {
			if (challenge.kind !== "two-factor") {
				return;
			}
			const attemptId = challenge.attemptId;
			const attempt = ctx.context.getSignInAttempt();
			const expiresAt =
				attempt?.id === attemptId
					? attempt.expiresAt
					: new Date(Date.now() + 10 * 60 * 1000);
			if (provider.organizationId) {
				await ctx.context.internalAdapter.createVerificationValue({
					identifier: `${constants.SSO_PENDING_PROVIDER_ORG_ASSIGNMENT_KEY_PREFIX}${attemptId}`,
					value: await symmetricEncrypt({
						key: ctx.context.secretConfig,
						data: JSON.stringify({
							userId: user.id,
							providerId: provider.providerId,
							profile: providerOrganizationAssignment.profile,
						}),
					}),
					expiresAt,
				});
			}
			if (!options?.saml?.enableSingleLogout || !extract.nameID) {
				return;
			}
			await storePendingSamlSessionRecord(
				ctx,
				attemptId,
				{
					userId: user.id,
					providerId,
					nameID: extract.nameID,
					sessionIndex,
				},
				expiresAt,
			);
		},
	});
	await assignOrganizationFromProvider(ctx, providerOrganizationAssignment);
	const finalizedSession = ctx.context.getIssuedSession();
	if (!finalizedSession) {
		throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
			message: "Failed to create session",
		});
	}

	// 19. SLO session record
	if (options?.saml?.enableSingleLogout && extract.nameID) {
		await persistSamlSessionRecord(
			ctx,
			{
				sessionId: finalizedSession.session.id,
				providerId,
				nameID: extract.nameID,
				sessionIndex,
			},
			finalizedSession.session.expiresAt,
		);
	}

	// 20. Compute safe redirect URL
	return getSafeRedirectUrl(
		relayState?.callbackURL || parsedSamlConfig.callbackUrl,
		currentCallbackPath,
		appOrigin,
		(url: string, settings?: { allowRelativePaths: boolean }) =>
			ctx.context.isTrustedOrigin(url, settings),
	);
}
