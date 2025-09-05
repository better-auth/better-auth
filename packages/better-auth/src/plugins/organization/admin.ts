import type { GenericEndpointContext, User } from "../../types";
import { admin, type UserWithRole } from "../admin";

const getAdminPlugin = (ctx: GenericEndpointContext) => {
	return ctx.context.options.plugins?.find(
		(plugin) => plugin.id === "admin",
	) as ReturnType<typeof admin>;
};

export const isSuperAdmin = (ctx: GenericEndpointContext): boolean => {
	const user = ctx.context.session?.user;
	const adminPlugin = getAdminPlugin(ctx);
	let adminRoles = adminPlugin.options?.adminRoles ?? ["admin"]
	if (!adminPlugin || !user?.role) {
		return false;
	}
	adminRoles = Array.isArray(adminRoles)
		? adminRoles
		: [adminRoles];

	return adminRoles.includes(user.role);
};
