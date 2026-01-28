import { base64Url } from "@better-auth/utils/base64";
import { createAuthMiddleware } from "better-auth/api";
import { SCIMAPIError } from "./scim-error";
import { verifySCIMToken } from "./scim-tokens";
import type { SCIMOptions, SCIMProvider } from "./types";

export type AuthMiddleware = ReturnType<typeof authMiddlewareFactory>;

/**
 * The middleware forces the endpoint to have a valid token
 */
export const authMiddlewareFactory = (opts: SCIMOptions) =>
	createAuthMiddleware(async (ctx) => {
		const authHeader = ctx.headers?.get("Authorization");
		const authSCIMToken = authHeader?.replace(/^Bearer\s+/i, "");

		if (!authSCIMToken) {
			throw new SCIMAPIError("UNAUTHORIZED", {
				detail: "SCIM token is required",
			});
		}

		const baseScimTokenParts = new TextDecoder()
			.decode(base64Url.decode(authSCIMToken))
			.split(":");

		const [scimToken, providerId] = baseScimTokenParts;
		const organizationId = baseScimTokenParts.slice(2).join(":");

		if (!scimToken || !providerId) {
			throw new SCIMAPIError("UNAUTHORIZED", {
				detail: "Invalid SCIM token",
			});
		}

		let scimProvider: Omit<SCIMProvider, "id"> | null =
			opts.defaultSCIM?.find((p) => {
				if (p.providerId === providerId && !organizationId) {
					return true;
				}

				return !!(
					p.providerId === providerId &&
					organizationId &&
					p.organizationId === organizationId
				);
			}) ?? null;

		if (scimProvider) {
			if (scimProvider.scimToken === scimToken) {
				return { authSCIMToken: scimProvider.scimToken, scimProvider };
			} else {
				throw new SCIMAPIError("UNAUTHORIZED", {
					detail: "Invalid SCIM token",
				});
			}
		}

		scimProvider = await ctx.context.adapter.findOne<SCIMProvider>({
			model: "scimProvider",
			where: [
				{ field: "providerId", value: providerId },
				...(organizationId
					? [{ field: "organizationId", value: organizationId }]
					: []),
			],
		});

		if (!scimProvider) {
			throw new SCIMAPIError("UNAUTHORIZED", {
				detail: "Invalid SCIM token",
			});
		}

		const isValidToken = await verifySCIMToken(
			ctx,
			opts,
			scimProvider.scimToken,
			scimToken,
		);

		if (!isValidToken) {
			throw new SCIMAPIError("UNAUTHORIZED", {
				detail: "Invalid SCIM token",
			});
		}

		return { authSCIMToken: scimToken, scimProvider };
	});
