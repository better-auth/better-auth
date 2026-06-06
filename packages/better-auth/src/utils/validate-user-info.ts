import type {
	GenericEndpointContext,
	ValidateUserInfoResult,
	ValidateUserInfoSource,
} from "@better-auth/core";
import type { User } from "../types";

export async function validateUserInfo(
	ctx: GenericEndpointContext,
	data: {
		user: Partial<User> & Record<string, unknown>;
		source: ValidateUserInfoSource;
	},
): Promise<ValidateUserInfoResult | null> {
	const validate = ctx.context.options.user?.validateUserInfo;
	if (!validate) {
		return null;
	}

	try {
		const validation = await validate(data, ctx.request);
		if (validation?.error) {
			return validation;
		}
	} catch (error) {
		ctx.context.logger.error("validateUserInfo callback failed", error);
		return {
			error: "validation_failed",
			errorDescription: "User validation failed",
		};
	}

	return null;
}
