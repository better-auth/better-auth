import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const schema = {
	session: {
		fields: {
			/**
			 * The device's public key as a JSON Web Key, set once the browser
			 * registers a device-bound session. A session with a key is only
			 * accepted together with a valid bound cookie.
			 */
			dbscPublicKey: {
				type: "string",
				required: false,
				input: false,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
