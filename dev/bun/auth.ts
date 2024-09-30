import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters";

export const auth = betterAuth({
	database: prismaAdapter(
		{},
		{
			provider: "mysql",
		},
	),
});
