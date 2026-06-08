import type {
	GenericEndpointContext,
	ValidateUserInfoSource,
} from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import type { User } from "../types";

export function assertValidUserInfoSource(
	source: ValidateUserInfoSource,
): void {
	if (!source?.method) {
		throw new APIError("FORBIDDEN", {
			code: "validation_source_missing",
			message: "User validation source is required",
		});
	}
	if (source.method === "oauth" && !source.oauth?.providerId) {
		throw new APIError("FORBIDDEN", {
			code: "validation_source_missing",
			message: "OAuth user validation source requires oauth.providerId",
		});
	}
	if (
		(source.method === "sso-oidc" || source.method === "sso-saml") &&
		!source.sso?.providerId
	) {
		throw new APIError("FORBIDDEN", {
			code: "validation_source_missing",
			message: "SSO user validation source requires sso.providerId",
		});
	}
}

/**
 * Invoke the application's `user.validateUserInfo` gate and throw a `403`
 * {@link APIError} if it rejects.
 *
 * Fails closed: if the hook throws, provisioning is rejected rather than
 * silently allowed.
 */
export async function assertValidUserInfo(
	ctx: GenericEndpointContext,
	data: {
		user: Partial<User> & Record<string, unknown>;
		source: ValidateUserInfoSource;
	},
): Promise<void> {
	const validate = ctx.context.options.user?.validateUserInfo;
	if (!validate) {
		return;
	}
	assertValidUserInfoSource(data.source);

	let result: Awaited<ReturnType<typeof validate>>;
	try {
		result = await validate(data, ctx);
	} catch (error) {
		ctx.context.logger.error("validateUserInfo callback threw", error);
		throw new APIError("FORBIDDEN", {
			code: "validation_failed",
			message: "User validation failed",
		});
	}

	if (result?.error) {
		throw new APIError("FORBIDDEN", {
			code: result.error,
			message: result.errorDescription || result.error,
		});
	}
}
