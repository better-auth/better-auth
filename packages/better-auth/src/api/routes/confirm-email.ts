import { z } from "zod";
import { createAuthEndpoint } from "../call";

export const confirmEmail = createAuthEndpoint(
	"/confirm-email",
	{
		method: "POST",
		body: z.object({
			token: z.string(),
			email: z.string().email(),
		}),
	},
	async (ctx) => {},
);
