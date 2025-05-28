import type { BetterAuthPlugin } from "../../types";

export const multiTenant = () => {
	return {
		id: "multiTenancy",
		onRequest: async (req, ctx) => {
			if (ctx.options.multiTenancy?.enabled) {
				const tenantId = ctx.options.multiTenancy?.tenantResolver(req, ctx);
				if (!tenantId)
					throw new Error("Failed to get tenantId in tenantResolver");
				ctx.tenantId = tenantId;
			}
		},
	} satisfies BetterAuthPlugin;
};
