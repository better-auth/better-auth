import { describe, it } from "vitest";

import { getTestInstance } from "../test-utils/test-instance";
import { createAuthClient } from "./base";
import { createAuthClient as createReactClient } from "./react";
import { twoFactorClient } from "../plugins";
import { usernameClient } from "../plugins/username/client";
import { organizationClient } from "./plugins";
import { createAccessControl } from "../plugins/organization/access";

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
		const ac = createAccessControl({
			user: ["read", "update"],
		});
		const admin = ac.newRole({
			user: ["read"],
		});
		const client = createReactClient({
			baseURL: "http://localhost:3000/api/auth",
			customFetchImpl: async (url, options) => {
				console.log(url.toString());
				return new Response();
			},
			authPlugins: [
				organizationClient({
					ac,
					roles: {
						admin,
					},
				}),
			],
			csrfPlugin: false,
		});
		client.organization.useActiveOrganization();
	});
});
