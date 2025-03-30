import type { Adapter } from "../../../types";
import type { BetterAuthOptions } from "../../../types";

export const createTestOptions = (
	adapter: (options: BetterAuthOptions) => Adapter,
	useNumberId = false,
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
			database: {
				useNumberId,
			},
		},
	}) satisfies BetterAuthOptions;
