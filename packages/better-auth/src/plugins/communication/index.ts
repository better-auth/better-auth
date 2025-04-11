import type { BetterAuthPlugin } from "../../types";
import { createAuthEndpoint } from "../../api";
import { z } from "zod";
import { Provider } from "./providers/types";

export type communicationOptions = {
	provider: Provider;
};

export const communication = (options: communicationOptions) => {
	return {
		id: "communication",
		endpoints: {
			sendEmail: createAuthEndpoint(
				"/communication/send-email",
				{
					method: "POST",
					body: z.object({
						to: z.list(z.string()),
						cc: z.list(z.string()),
						bcc: z.list(z.string()),
						subject: z.string(),
						body: z.string(),
					}),
				},
				async (ctx) => {
					const { to, cc, bcc, subject, body } = await ctx.body;
                    options.provider.send()
				}
			),
		},
	} satisfies BetterAuthPlugin;
};
