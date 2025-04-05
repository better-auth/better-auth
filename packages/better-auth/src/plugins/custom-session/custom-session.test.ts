import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { customSession } from ".";
import { admin } from "../admin";
import { createAuthClient } from "../../client";
import { customSessionClient } from "./client";
import type { BetterAuthOptions } from "../../types";
import { adminClient } from "../admin/client";

describe("Custom Session Plugin Tests", async () => {
	const options = {
		plugins: [admin()],
	} satisfies BetterAuthOptions;
	const { auth, signInWithTestUser, testUser, customFetchImpl } =
		await getTestInstance({
			plugins: [
				...options.plugins,
				customSession(async ({ user, session }) => {
					const newData = {
						message: "Hello, World!",
					};
					return {
						user: {
							firstName: user.name.split(" ")[0],
							lastName: user.name.split(" ")[1],
						},
						newData,
						session,
					};
				}, options),
			],
		});

	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [customSessionClient<typeof auth>(), adminClient()],
		fetchOptions: { customFetchImpl },
	});

	it("should return the session", async () => {
		const { headers } = await signInWithTestUser();
		const session = await auth.api.getSession({ headers });
		const s = await client.getSession({ fetchOptions: { headers } });
		expect(s.data?.newData).toEqual({ message: "Hello, World!" });
		expect(session?.newData).toEqual({ message: "Hello, World!" });
	});

	it("should return set cookie headers", async () => {
		const { headers } = await signInWithTestUser();
		await client.getSession({
			fetchOptions: {
				headers,
				onResponse(context) {
					expect(context.response.headers.get("set-cookie")).toBeDefined();
				},
			},
		});
	});
});
