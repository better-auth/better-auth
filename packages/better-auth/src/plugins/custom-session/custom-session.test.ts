import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { customSession } from ".";
import { admin } from "../admin";
import { createAuthClient } from "../../client";
import { customSessionClient } from "./client";
import type { BetterAuthOptions } from "../../types";
import { adminClient } from "../admin/client";
import { multiSession } from "../multi-session";
import { multiSessionClient } from "../multi-session/client";
import { parseSetCookieHeader } from "../../cookies";

describe("Custom Session Plugin Tests", async () => {
	const options = {
		plugins: [admin(), multiSession()],
	} satisfies BetterAuthOptions;
	const { auth, signInWithTestUser, testUser, customFetchImpl, cookieSetter } =
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
		plugins: [
			customSessionClient<typeof auth>(),
			adminClient(),
			multiSessionClient(),
		],
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
		const s = await client.getSession({
			fetchOptions: {
				headers,
				onResponse(context) {
					expect(context.response.headers.get("set-cookie")).toBeDefined();
				},
			},
		});
	});

	it("should return the custom session for multi-session", async () => {
		let headers = new Headers();
		const testUser = {
			email: "second-email@test.com",
			password: "password",
			name: "Name",
		};

		await client.signUp.email(
			{
				name: testUser.name,
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		const sessions = await auth.api.listDeviceSessions({
			headers,
		});
		const session = sessions[0]!;
		//@ts-expect-error
		expect(session.newData).toEqual({ message: "Hello, World!" });
	});
});
