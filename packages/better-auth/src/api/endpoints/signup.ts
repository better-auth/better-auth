import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { providerList } from "../../provider";

export const signUpOAuth = createAuthEndpoint(
	"/signup/oauth",
	{
		method: "POST",
		body: z.object({
			/**
			 * OAuth2 provider to use
			 */
			provider: z.enum(providerList),
			/**
			 * the data to be extracted from the
			 * provider's user info
			 */
			data: z.record(z.any()),
		}),
	},
	async (c) => {
		return {
			url: "",
		};
	},
);
