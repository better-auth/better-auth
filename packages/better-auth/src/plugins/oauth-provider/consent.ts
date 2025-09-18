import { APIError } from "../../api";
import type { OAuthOptions, VerificationValue } from "./types";
import type { GenericEndpointContext } from "../../types";
import type { Verification } from "../../types";
import { generateRandomString } from "../../crypto";
import { formatErrorURL } from "./authorize";

export async function consentEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
) {
	const { name: cookieName } = ctx.context.createAuthCookie(
		"oauth_consent_prompt",
	);
	const storedCode = await ctx.getSignedCookie(cookieName, ctx.context.secret);
	ctx.setCookie(cookieName, "", {
		maxAge: 0,
	});
	if (!storedCode) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "No consent prompt found",
			error: "invalid_request",
		});
	}

	const verification = await ctx.context.internalAdapter
		.findVerificationValue(storedCode)
		.then((val) => {
			if (!val) return null;
			let parsedValue: VerificationValue | undefined;
			if (val.value) {
				try {
					parsedValue = JSON.parse(val.value);
				} catch (err) {
					// Handle invalid JSON gracefully
					// For example, return null or throw a specific invalid_request error
					throw new Error(
						"invalid_request: verification value is not valid JSON",
					);
				}
			}
			return {
				...val,
				value: parsedValue,
			} as Omit<Verification, "value"> & { value?: VerificationValue };
		});
	const verificationValue = verification?.value;

	// Check verification
	if (!verification) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "Invalid code",
			error: "invalid_request",
		});
	}
	if (verification.expiresAt < new Date()) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "Code expired",
			error: "invalid_request",
		});
	}

	// Check verification value
	if (!verificationValue) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "missing verification value content",
			error: "invalid_verification",
		});
	}
	if (!verificationValue.requireConsent) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "Consent given or not required",
			error: "invalid_request",
		});
	}
	if (!verificationValue.redirectUri) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "Missing redirect uri",
			error: "invalid_request",
		});
	}

	// Consent not accepted (ensure it's strictly boolean true)
	const accepted = ctx.body.accept === true;
	if (!accepted) {
		await ctx.context.internalAdapter.deleteVerificationValue(verification.id);
		return ctx.json({
			redirect_uri: formatErrorURL(
				verificationValue.redirectUri,
				"access_denied",
				"User denied access",
				verificationValue.state,
			),
		});
	}

	// Consent accepted
	const code = generateRandomString(32, "a-z", "A-Z", "0-9");
	const iat = Math.floor(Date.now() / 1000);
	const now = new Date(iat * 1000);
	const exp = iat + (opts.codeExpiresIn ?? 600);

	await ctx.context.internalAdapter.updateVerificationValue(verification.id, {
		value: JSON.stringify({
			...verificationValue,
			requireConsent: false,
		}),
		identifier: code,
		expiresAt: new Date(exp * 1000),
	});
	await ctx.context.adapter.create({
		model: opts.schema?.oauthConsent?.modelName ?? "oauthConsent",
		data: {
			clientId: verificationValue.clientId,
			userId: verificationValue.userId,
			scopes: verificationValue.scopes,
			consentGiven: true,
			createdAt: now,
			updatedAt: now,
		},
	});
	const redirectUri = new URL(verificationValue.redirectUri ?? opts.loginPage);
	redirectUri.searchParams.set("code", code);
	if (verificationValue.state) {
		redirectUri.searchParams.set("state", verificationValue.state);
	}
	// Redirect back to application
	return ctx.json({
		redirect_uri: redirectUri.toString(),
	});
}
