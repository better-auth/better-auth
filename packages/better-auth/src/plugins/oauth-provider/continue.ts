import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "../../api";
import type { Verification } from "../../types";
import { authorizeEndpoint } from "./authorize";
import type {
	OAuthAuthorizationQuery,
	OAuthOptions,
	Scope,
	VerificationValue,
} from "./types";
import { storeToken } from "./utils";

export async function continueEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	// Continue login flow (ensure it's strictly boolean true)
	if (ctx.body.selected === true) {
		return await selected(ctx, opts);
	} else if (ctx.body.postLogin === true) {
		return await postLogin(ctx, opts);
	} else {
		throw new APIError("BAD_REQUEST", {
			error_description: "Missing parameters",
			error: "invalid_request",
		});
	}
}

async function selected(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const { name: cookieName, attributes: cookieAttributes } =
		ctx.context.createAuthCookie("oauth_login_prompt");
	const cookie = await ctx.getSignedCookie(cookieName, ctx.context.secret);
	if (!cookie) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "No login_prompt cookie found",
			error: "invalid_request",
		});
	}

	ctx.query = JSON.parse(cookie);
	ctx.headers?.set("accept", "application/json");
	let prompts:
		| Exclude<OAuthAuthorizationQuery["prompt"], undefined>[]
		| undefined = ctx.query.prompt?.split(" ");
	const foundPrompt = prompts?.findIndex((v) => v === "select_account") ?? -1;
	if (foundPrompt >= 0) {
		prompts?.splice(foundPrompt, 1);
		ctx.query.prompt = prompts?.length ? prompts?.join(" ") : undefined;
	}
	const { url } = await authorizeEndpoint(ctx, opts);
	return {
		redirect_uri: url,
	};
}

async function postLogin(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const { name: cookieName, attributes: cookieAttributes } =
		ctx.context.createAuthCookie("oauth_post_login");
	const storedCode = await ctx.getSignedCookie(cookieName, ctx.context.secret);
	ctx.setCookie(cookieName, "", {
		path: ctx.context.options.basePath,
		sameSite: "lax",
		...cookieAttributes,
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
						error_description: "invalid code",
						error: "invalid_request",
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
	if (verificationValue.type !== "post_login") {
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

	// Return authorization code
	const query = verificationValue.query;
	ctx?.headers?.set("accept", "application/json");
	ctx.context.verification_id = verification.id;
	ctx.context.post_login = true;
	ctx.query = query;
	const { url } = await authorizeEndpoint(ctx, opts);
	return {
		redirect_uri: url,
	};
}
