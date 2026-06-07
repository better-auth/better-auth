import type {
	GenericEndpointContext,
	ValidateUserInfoSource,
} from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import type { User } from "../types";

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
