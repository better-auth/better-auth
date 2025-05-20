import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";

export const auth = betterAuth({
	baseURL: "http://localhost:4000",
	database: prismaAdapter(
		{},
		{
			provider: "sqlite",
		},
	),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [twoFactor()],
});
