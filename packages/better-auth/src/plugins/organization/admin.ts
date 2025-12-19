import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import { admin } from "../admin";
import type { OrganizationOptions } from "./types";

const getAdminPlugin = (ctx: GenericEndpointContext) => {
	return ctx.context.options.plugins?.find(
		(plugin: BetterAuthPlugin) => plugin.id === "admin",
	) as ReturnType<typeof admin>;
};

export const isSuperAdmin = <O extends OrganizationOptions>(
	options: O,
	ctx: GenericEndpointContext,
): boolean => {
	const user = ctx.context.session?.user;
	const adminPlugin = getAdminPlugin(ctx);
	let adminRoles = adminPlugin?.options?.adminRoles ?? ["admin"];
	if (!options?.allowSuperAdmin || !adminPlugin || !user?.role) {
		return false;
	}
	adminRoles = Array.isArray(adminRoles) ? adminRoles : [adminRoles];

	return adminRoles.includes(user.role);
};
