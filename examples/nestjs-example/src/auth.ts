import { betterAuth } from "better-auth";

export const auth = betterAuth({
	trustedOrigins: ["http://localhost:3001"],
});
