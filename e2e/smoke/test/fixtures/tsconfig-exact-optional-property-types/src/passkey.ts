import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";

export const auth = betterAuth({
	plugins: [
		passkey({
			rpID: "localhost",
			rpName: "App",
			origin: "http://localhost:3000",
		}),
	],
});
