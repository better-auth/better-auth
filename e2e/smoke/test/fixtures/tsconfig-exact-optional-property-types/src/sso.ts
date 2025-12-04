import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";

export const auth = betterAuth({
	plugins: [sso()],
});
