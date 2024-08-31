import { describe, it } from "vitest";

import { getTestInstance } from "../test-utils/test-instance";
import { createAuthClient } from "./base";
import { createAuthClient as createReactClient } from "./react";
import { twoFactor } from "./plugins/two-factor";
import { organization } from "./plugins/organization";
import { passkey } from "./plugins/passkey";
import { twoFactorClient } from "../plugins";
import { usernameClient } from "../plugins/username/client";

describe("client path to object", async () => {
	const auth = await getTestInstance({
		plugins: [
			// passkey({
			// 	rpID: "test",
			// 	rpName: "test",
			// }),
		],
	});

	it("should return a path to object", async () => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000/api/auth",
			customFetchImpl: async (url, options) => {
				return new Response();
			},
			authPlugins: [twoFactor, passkey],
		});
		client.$atoms.$session;

		const client2 = createReactClient({
			authPlugins: [
				organization,
				twoFactorClient({
					twoFactorPage: "/two-factor",
				}),
				usernameClient,
			],
		});
	});
});
