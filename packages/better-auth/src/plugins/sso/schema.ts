import { socialProviderList } from "../../social-providers";

import type { PluginSchema } from "../../types";
import { z } from "zod";

export const schema: PluginSchema = {
	ssoConfig: {
		fields: {
			provider: {
				type: "string",
				required: true,
			},
			config: {
				type: "string",
				required: true,
			},
			createdAt: {
				type: "string",
				required: true,
			},
		},
	},
};

export const ssoConfig = z.object({
	id: z.string(),
	provider: z.enum(socialProviderList),
	config: z.string(),
	createdAt: z.date(),
});

export type SsoConfig = z.infer<typeof ssoConfig>;
