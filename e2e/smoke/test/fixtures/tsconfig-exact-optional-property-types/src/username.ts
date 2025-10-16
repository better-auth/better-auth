import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";

export const auth = betterAuth({
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		username({
			minUsernameLength: 4,
			maxUsernameLength: 15,
		}),
	],
});
