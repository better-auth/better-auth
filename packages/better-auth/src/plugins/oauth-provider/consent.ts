import { APIError } from "../../api";
import type { OAuthConsent, OAuthOptions, VerificationValue } from "./types";
import type { GenericEndpointContext } from "@better-auth/core";
import type { Verification } from "../../types";
import { authorizeEndpoint, formatErrorURL } from "./authorize";
import { storeToken } from "./utils";

export async function consentEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
) {
	const { name: cookieName } = ctx.context.createAuthCookie("oauth_consent");
	const storedCode = await ctx.getSignedCookie(cookieName, ctx.context.secret);
	ctx.setCookie(cookieName, "", {
		maxAge: 0,
	});
	if (!storedCode) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "No consent code found",
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
	if (verificationValue.type !== "consent") {
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
	if (!verificationValue.query.scope) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "Missing orginal requested scopes",
			error: "invalid_request",
		});
	}

	// Check scopes if received (can only be equal or lesser than originally requested scopes)
	const requestedScopes = (ctx.body.scope as string | undefined)?.split(" ");
	if (requestedScopes) {
		const originalRequestedScopes = verificationValue.query.scope;
		if (!requestedScopes.every((sc) => originalRequestedScopes?.includes(sc))) {
			throw new APIError("BAD_REQUEST", {
				error_description: "Scope not originally requested",
				error: "invalid_request",
			});
		}
	}

	// Consent not accepted (ensure it's strictly boolean true)
	const accepted = ctx.body.accept === true;
	if (!accepted) {
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

	// Consent accepted
	const foundConsent = await ctx.context.adapter
		.findOne<OAuthConsent>({
			model: opts.schema?.oauthConsent?.modelName ?? "oauthConsent",
			where: [
				{
					field: "clientId",
					value: verificationValue.query.client_id,
				},
				{
					field: "userId",
					value: verificationValue.userId,
				},
			],
		})
		.then((res) => {
			if (!res) return undefined;
			return {
				...res,
				scopes: (res.scopes as unknown as string)?.split(" "),
			} as OAuthConsent & { id: string };
		});
	const iat = Math.floor(Date.now() / 1000);
	const consent: OAuthConsent = {
		clientId: verificationValue.query.client_id,
		userId: verificationValue.userId,
		scopes: requestedScopes ?? verificationValue.query.scope.split(" "),
		consentGiven: true,
		createdAt: new Date(iat * 1000),
		updatedAt: new Date(iat * 1000),
	};
	foundConsent?.id
		? await ctx.context.adapter.update({
				model: opts.schema?.oauthConsent?.modelName ?? "oauthConsent",
				where: [
					{
						field: "id",
						value: foundConsent.id,
					},
				],
				update: {
					scopes: consent.scopes.join(" "),
					updatedAt: new Date(iat * 1000),
				},
			})
		: await ctx.context.adapter.create({
				model: opts.schema?.oauthConsent?.modelName ?? "oauthConsent",
				data: {
					...consent,
					scopes: consent.scopes.join(" "),
				},
			});

	// Return authorization code
	const query = {
		...verificationValue.query,
		scope: consent.scopes.join(" "),
	};
	ctx?.headers?.set("accept", "application/json");
	if (query.prompt === "consent") {
		query.prompt = undefined;
	}
	ctx.context.verification_id = verification.id;
	ctx.query = query;
	const { url } = await authorizeEndpoint(ctx, opts);
	return {
		redirect_uri: url,
	};
}
