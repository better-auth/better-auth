import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";

/**
 * Middleware that verifies the authenticated user owns a resource.
 * Must be used after sessionMiddleware in the `use` array.
 *
 * Fetches the resource by ID from the request body or query,
 * then verifies `resource[ownerField] === session.user.id`.
 * Throws NOT_FOUND if the resource doesn't exist, FORBIDDEN if
 * the user doesn't own it.
 *
 * The fetched resource is returned on `ctx.context.verifiedResource`
 * so the handler can use it without a redundant DB query.
 */
export function requireResourceOwnership(config: {
	/** Database model name (e.g., "passkey", "apiKey") */
	model: string;
	/** Request parameter name containing the resource ID */
	idParam: string;
	/** Where to find the ID: "body" or "query" */
	idSource: "body" | "query";
	/** Field on the resource that holds the owner's user ID. Default: "userId" */
	ownerField?: string;
	/**
	 * Custom error to throw when the resource is not found.
	 * Accepts a `{ code, message }` from `defineErrorCodes`.
	 * Default: generic NOT_FOUND.
	 */
	notFoundError?: { code: string; message: string };
	/**
	 * Custom error to throw when the user doesn't own the resource.
	 * Accepts a `{ code, message }` from `defineErrorCodes`.
	 * Default: generic FORBIDDEN.
	 */
	forbiddenError?: { code: string; message: string };
}) {
	const ownerField = config.ownerField ?? "userId";
	return createAuthMiddleware(async (ctx) => {
		const session = ctx.context.session as { user: { id: string } } | undefined;
		if (!session?.user?.id) {
			throw new APIError("UNAUTHORIZED");
		}

		const source = config.idSource === "body" ? ctx.body : ctx.query;
		const resourceId = source?.[config.idParam];
		if (!resourceId) {
			throw new APIError("BAD_REQUEST", {
				message: `Missing required parameter: ${config.idParam}`,
			});
		}

		const resource = await ctx.context.adapter.findOne({
			model: config.model,
			where: [{ field: "id", value: resourceId }],
		});

		if (!resource) {
			if (config.notFoundError) {
				throw APIError.from("NOT_FOUND", config.notFoundError);
			}
			throw new APIError("NOT_FOUND");
		}

		if ((resource as Record<string, unknown>)[ownerField] !== session.user.id) {
			if (config.forbiddenError) {
				throw APIError.from("FORBIDDEN", config.forbiddenError);
			}
			throw new APIError("FORBIDDEN");
		}

		return { verifiedResource: resource };
	});
}

/**
 * Middleware that verifies the authenticated user is a member of a
 * specific organization with one of the allowed roles.
 * Must be used after sessionMiddleware in the `use` array.
 *
 * Looks up the member record by {userId, organizationId}, then checks
 * the member's role against the allowed list.
 *
 * The verified member is returned on `ctx.context.verifiedMember`.
 */
export function requireOrgRole(config: {
	/** Request parameter name containing the organization ID */
	orgIdParam: string;
	/** Where to find the org ID: "body" or "query" */
	orgIdSource: "body" | "query";
	/**
	 * Roles that are authorized to proceed. If omitted or empty,
	 * any org membership is sufficient.
	 */
	allowedRoles?: string[];
}) {
	const parseMemberRoles = (role: string) =>
		role
			.split(",")
			.map((entry) => entry.trim())
			.filter(Boolean);

	return createAuthMiddleware(async (ctx) => {
		const session = ctx.context.session as { user: { id: string } } | undefined;
		if (!session?.user?.id) {
			throw new APIError("UNAUTHORIZED");
		}

		const source = config.orgIdSource === "body" ? ctx.body : ctx.query;
		const organizationId = source?.[config.orgIdParam];
		if (!organizationId) {
			throw new APIError("BAD_REQUEST", {
				message: `Missing required parameter: ${config.orgIdParam}`,
			});
		}

		const member = await ctx.context.adapter.findOne({
			model: "member",
			where: [
				{ field: "userId", value: session.user.id },
				{ field: "organizationId", value: organizationId },
			],
		});

		if (!member) {
			throw new APIError("FORBIDDEN", {
				message: "Not a member of this organization",
			});
		}

		if (config.allowedRoles?.length) {
			const memberRoles = parseMemberRoles(
				(member as Record<string, unknown>).role as string,
			);
			if (!memberRoles.some((role) => config.allowedRoles!.includes(role))) {
				throw new APIError("FORBIDDEN", {
					message: "Insufficient role for this operation",
				});
			}
		}

		return { verifiedMember: member };
	});
}
