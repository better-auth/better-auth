import { APIError } from "../../api";
import type { OAuthOptions, VerificationValue } from "./types";
import type { GenericEndpointContext } from "@better-auth/core";
import type { Verification } from "../../types";
import { authorizeEndpoint, formatErrorURL } from "./authorize";
import { storeToken } from "./utils";

export async function selectedAccountEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
) {
	const { name: cookieName } = ctx.context.createAuthCookie(
		"oauth_select_account",
	);
	const storedCode = await ctx.getSignedCookie(cookieName, ctx.context.secret);
	ctx.setCookie(cookieName, "", {
		maxAge: 0,
	});
	if (!storedCode) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "No select_account code found",
			error: "invalid_request",
		});
	}

	const verification = await ctx.context.internalAdapter
		.findVerificationValue(
			await storeToken(opts.storeTokens, storedCode, "authorization_code"),
		)
		.then((val) => {
			if (!val) return null;
			let parsedValue: VerificationValue | undefined;
			if (val.value) {
				try {
					parsedValue = JSON.parse(val.value);
				} catch (err) {
					throw new APIError("UNAUTHORIZED", {
						message: "invalid verification value",
					});
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
	if (verificationValue.type !== "select_account") {
		throw new APIError("UNAUTHORIZED", {
			error_description: "incorrect token type",
			error: "invalid_request",
		});
	}
	if (!verificationValue.query) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "Missing query",
			error: "invalid_request",
		});
	}

	// Consent not accepted (ensure it's strictly boolean true)
	const confirmed = ctx.body.confirm === true;
	if (!confirmed) {
		await ctx.context.internalAdapter.deleteVerificationValue(verification.id);
		return ctx.json({
			redirect_uri: formatErrorURL(
				verificationValue.query.redirect_uri,
				"access_denied",
				"User denied access",
				verificationValue.query?.state,
			),
		});
	}

	// Continue authorization
	const query = verificationValue.query;
	ctx.headers?.set("accept", "application/json");
	if (query.prompt === "select_account") {
		query.prompt = undefined;
	}
	ctx.context.verification_id = verification.id;
	ctx.query = query;
	const { url } = await authorizeEndpoint(ctx, opts);
	return {
		redirect_uri: url,
	};
}
