import { organization } from "@better-auth/organization";
import { betterAuth } from "better-auth";

export const auth = betterAuth({
	plugins: [organization({})],
});
