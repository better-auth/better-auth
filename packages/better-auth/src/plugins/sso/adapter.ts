import type { Adapter } from "../../types";
import type { SsoConfig } from "./schema";

export const getSsoAdapter = (adapter: Adapter) => {
	return {
		getSsoConfig: async (id: string) => {
			const ssoConfig = await adapter.findOne<SsoConfig>({
				model: "ssoConfig",
				where: [
					{
						field: "id",
						value: id,
					},
				],
			});
			return ssoConfig;
		},
	};
};
