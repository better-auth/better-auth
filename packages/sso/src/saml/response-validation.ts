import type { GenericEndpointContext } from "@better-auth/core";
import type { SAMLAssertionExtract } from "../types";

interface AuthnRequestRecord {
	id: string;
	providerId: string;
	createdAt: number;
	expiresAt: number;
}

const AUTHN_REQUEST_KEY_PREFIX = "saml-authn-request:";

export interface InResponseToValidationContext {
	extract: SAMLAssertionExtract;
	providerId: string;
	options: {
		enableInResponseToValidation?: boolean;
		allowIdpInitiated?: boolean;
	};
	redirectUrl: string;
}

/**
 * Validates the InResponseTo attribute of a SAML Response.
 *
 * This binds the IdP's Response to a specific SP-initiated AuthnRequest,
 * preventing replay attacks, unsolicited response injection, and
 * cross-provider assertion swaps.
 *
 * The InResponseTo value lives at `extract.response.inResponseTo` in
 * samlify's parsed output (not at the top level).
 */
export async function validateInResponseTo(
	c: GenericEndpointContext,
	ctx: InResponseToValidationContext,
): Promise<void> {
	if (ctx.options.enableInResponseToValidation === false) {
		return;
	}

	const inResponseTo = ctx.extract.response?.inResponseTo;
	const allowIdpInitiated = ctx.options.allowIdpInitiated ?? false;

	if (inResponseTo) {
		let storedRequest: AuthnRequestRecord | null = null;

		const verification = await c.context.internalAdapter.findVerificationValue(
			`${AUTHN_REQUEST_KEY_PREFIX}${inResponseTo}`,
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
			c.context.logger.error(
				"SAML InResponseTo validation failed: unknown or expired request ID",
				{ inResponseTo, providerId: ctx.providerId },
			);
			throw c.redirect(
				`${ctx.redirectUrl}?error=invalid_saml_response&error_description=Unknown+or+expired+request+ID`,
			);
		}

		if (storedRequest.providerId !== ctx.providerId) {
			c.context.logger.error(
				"SAML InResponseTo validation failed: provider mismatch",
				{
					inResponseTo,
					expectedProvider: storedRequest.providerId,
					actualProvider: ctx.providerId,
				},
			);
			await c.context.internalAdapter.deleteVerificationByIdentifier(
				`${AUTHN_REQUEST_KEY_PREFIX}${inResponseTo}`,
			);
			throw c.redirect(
				`${ctx.redirectUrl}?error=invalid_saml_response&error_description=Provider+mismatch`,
			);
		}

		// Single-use: delete the stored request after successful validation
		await c.context.internalAdapter.deleteVerificationByIdentifier(
			`${AUTHN_REQUEST_KEY_PREFIX}${inResponseTo}`,
		);
	} else if (!allowIdpInitiated) {
		c.context.logger.error(
			"SAML IdP-initiated SSO rejected: InResponseTo missing and allowIdpInitiated is false",
			{ providerId: ctx.providerId },
		);
		throw c.redirect(
			`${ctx.redirectUrl}?error=unsolicited_response&error_description=IdP-initiated+SSO+not+allowed`,
		);
	}
}

export interface AudienceValidationContext {
	extract: SAMLAssertionExtract;
	expectedAudience: string | undefined;
	providerId: string;
	redirectUrl: string;
}

/**
 * Validates the AudienceRestriction of a SAML assertion.
 *
 * Per SAML 2.0 Core §2.5.1, an assertion's Audience element specifies
 * the intended recipient SP. Without this check, an assertion issued
 * for a different SP (e.g., another application sharing the same IdP)
 * could be accepted.
 */
export function validateAudience(
	c: GenericEndpointContext,
	ctx: AudienceValidationContext,
): void {
	if (!ctx.expectedAudience) {
		return;
	}

	const audience = ctx.extract.audience;

	if (!audience) {
		c.context.logger.error(
			"SAML assertion missing AudienceRestriction but audience is configured — rejecting",
			{ providerId: ctx.providerId },
		);
		throw c.redirect(
			`${ctx.redirectUrl}?error=invalid_saml_response&error_description=Audience+restriction+missing`,
		);
	}

	// samlify returns a string for a single Audience element, or an array
	// when multiple <Audience> values are present in the restriction.
	const audiences = Array.isArray(audience) ? audience : [audience];

	if (!audiences.includes(ctx.expectedAudience)) {
		c.context.logger.error(
			"SAML audience mismatch: assertion was issued for a different service provider",
			{
				expected: ctx.expectedAudience,
				received: audiences,
				providerId: ctx.providerId,
			},
		);
		throw c.redirect(
			`${ctx.redirectUrl}?error=invalid_saml_response&error_description=Audience+mismatch`,
		);
	}
}
