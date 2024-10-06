import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
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

try {
	await auth.api.signOut();
} catch (e) {
	if (e instanceof APIError) {
	}
}
