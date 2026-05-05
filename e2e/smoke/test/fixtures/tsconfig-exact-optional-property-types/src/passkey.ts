/**
 * @see https://github.com/better-auth/better-auth/issues/9212
 */
import { passkey } from "@better-auth/passkey";
import { passkeyClient } from "@better-auth/passkey/client";
import { betterAuth } from "better-auth";
import { createAuthClient } from "better-auth/react";

export const auth = betterAuth({
	plugins: [
		passkey({
			rpID: "localhost",
			rpName: "App",
			origin: "http://localhost:3000",
		}),
	],
});

export const authWithoutSessionRequired = betterAuth({
	plugins: [
		passkey({
			rpID: "localhost",
			rpName: "App",
			origin: "http://localhost:3000",
			registration: {
				requireSession: false,
			},
		}),
	],
});

export const authClient = createAuthClient({
	baseURL: "http://localhost:3000",
	plugins: [passkeyClient()],
});

authClient.signIn.passkey;
authClient.passkey.addPasskey;
