import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins";

export const auth = betterAuth({
	database: prismaAdapter(
		{},
		{
			provider: "mysql",
		},
	),
	plugins: [twoFactor()],
});
