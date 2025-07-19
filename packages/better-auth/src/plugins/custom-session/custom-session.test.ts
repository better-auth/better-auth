import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { customSession } from ".";
import { admin } from "../admin";
import { createAuthClient } from "../../client";
import { customSessionClient } from "./client";
import type { BetterAuthOptions } from "../../types";
import { adminClient } from "../admin/client";
import { getCookieCache } from "../../cookies";

describe("Custom Session Plugin Tests", async () => {
	const options = {
		plugins: [admin()],
		session: {
			cookieCache: {
				enabled: true,
			},
		},
	} satisfies BetterAuthOptions;
	const { auth, signInWithTestUser, testUser, customFetchImpl } =
		await getTestInstance({
			...options,
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
				onResponse(context: any) {
					expect(context.response.headers.get("set-cookie")).toBeDefined();
				},
			},
		});
	});

	it("should cache custom fields in session cookie", async () => {
		const { headers } = await signInWithTestUser();

		let responseHeaders: Headers | undefined;
		await client.getSession({
			fetchOptions: {
				headers,
				onResponse(context) {
					responseHeaders = context.response.headers;
				},
			},
		});

		const cookie = responseHeaders?.get("set-cookie");
		expect(cookie).toBeDefined();
		const requestHeaders = new Headers();
		if (cookie) {
			requestHeaders.set("cookie", cookie);
		}
		const cachedData = await getCookieCache(requestHeaders, {
			secret: auth.options.secret,
		});
		console.log(cachedData);
		expect((cachedData as any)?.newData).toEqual({ message: "Hello, World!" });
	});
});
