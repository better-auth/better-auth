import { defaultRoles } from "./access";

interface AuthContext {
	adapter: {
		findOne: (params: {
			model: string;
			where: Array<{ field: string; value: string }>;
		}) => Promise<unknown>;
	};
	session?: {
		userId: string;
	};
}

export async function hasPermission(
	ctx: AuthContext,
	organizationId: string,
	permission: string,
): Promise<boolean> {
	const member = await ctx.adapter.findOne({
		model: "member",
		where: [
			{
				field: "userId",
				value: ctx.session?.userId || "",
			},
			{
				field: "organizationId",
				value: organizationId,
			},
		],
	});

	if (!member) {
		return false;
	}

	const role = (member as { role: string }).role as keyof typeof defaultRoles;
	const rolePermissions = defaultRoles[role];

	return (rolePermissions as readonly string[]).includes(permission);
}

export async function requirePermission(
	ctx: AuthContext,
	organizationId: string,
	permission: string,
): Promise<void> {
	const hasAccess = await hasPermission(ctx, organizationId, permission);

	if (!hasAccess) {
		const APIError = await import("better-auth/api").then((m) => m.APIError);
		throw new APIError("FORBIDDEN", {
			message: `Insufficient permissions for ${permission}`,
		});
	}
}
