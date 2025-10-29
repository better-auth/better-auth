import { APIError } from "better-auth/api";
import { createAuthMiddleware } from "better-auth/plugins";
import type { SCIMProvider } from "./types";

/**
 * The middleware forces the endpoint to have a valid token
 */
export const authMiddleware = createAuthMiddleware(async (ctx) => {
	const authHeader = ctx.headers?.get("Authorization");
	const authSCIMToken = authHeader?.replace(/^Bearer\s+/i, "");

	if (!authSCIMToken) {
		throw new APIError("UNAUTHORIZED", {
			message: "SCIM token is required",
		});
	}

	const scimProvider = await ctx.context.adapter.findOne<SCIMProvider>({
		model: "scimProvider",
		where: [{ field: "scimToken", value: authSCIMToken }],
	});

	if (!scimProvider?.organizationId) {
		throw new APIError("UNAUTHORIZED", { message: "Invalid SCIM token" });
	}

	return { authSCIMToken, scimProvider };
});
