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

	it("should not create memory leaks with multiple plugin instances", async () => {
		const initialMemory = process.memoryUsage();

		const pluginInstances = [];
		const sessionCount = 100;

		for (let i = 0; i < sessionCount; i++) {
			const plugin = customSession(async ({ user, session }) => {
				return {
					user: {
						...user,
						testField: `test-${i}`,
					},
					session,
					iteration: i,
				};
			});
			pluginInstances.push(plugin);
		}

		// Force garbage collection if available (in test environment)
		if (global.gc) {
			global.gc();
		}

		const afterPluginCreation = process.memoryUsage();

		const memoryIncrease =
			afterPluginCreation.heapUsed - initialMemory.heapUsed;
		const memoryIncreasePerPlugin = memoryIncrease / sessionCount;
		// Each plugin instance should not use more than <5KB of memory
		// (this is a reasonable threshold that indicates no major memory leak)
		expect(memoryIncreasePerPlugin).toBeLessThan(5 * 1024);
		// Verify that plugins are still functional
		expect(pluginInstances).toHaveLength(sessionCount);
		expect(pluginInstances[0].id).toBe("custom-session");
		expect(pluginInstances[sessionCount - 1].id).toBe("custom-session");
	});
});
