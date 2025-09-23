import type { Adapter, BetterAuthAdvancedOptions } from "../../../types";
import type { BetterAuthOptions } from "../../../types";

export const createTestOptions = (
	adapter: (options: BetterAuthOptions) => Adapter,
	databaseAdvancedOptions: Required<BetterAuthAdvancedOptions>["database"] = {
		useNumberId: false,
	},
) =>
	({
		database: adapter,
		user: {
			fields: { email: "email_address" },
			additionalFields: {
				test: {
					type: "string",
					defaultValue: "test",
				},
			},
		},
		session: {
			modelName: "sessions",
		},
		advanced: {
			database: databaseAdvancedOptions,
		},
	}) satisfies BetterAuthOptions;
