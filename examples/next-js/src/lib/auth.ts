import { betterAuth } from "better-auth";
import { organization, passkey, twoFactor } from "better-auth/plugins";
import { ac } from "./permissions";

export const auth = betterAuth({
	database: {
		provider: "sqlite",
		url: "./auth.db",
	},
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		organization({
			ac,
		}),
		twoFactor(),
		passkey({}),
	],
});

const something = "" as const;
