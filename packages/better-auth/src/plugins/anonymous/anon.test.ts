import { describe, expect, it, vi } from "vitest";
import { anonymous } from ".";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthClient } from "../../client";
import { anonymousClient } from "./client";

describe("anonymous", async () => {
	const linkAccountFn = vi.fn();
	const { customFetchImpl, sessionSetter, testUser } = await getTestInstance({
		plugins: [
			anonymous({
				async onLinkAccount(data) {
					linkAccountFn(data);
				},
				schema: {
					user: {
						fields: {
							isAnonymous: "is_anon",
						},
					},
				},
			}),
		],
	});
	const headers = new Headers();
	const client = createAuthClient({
		plugins: [anonymousClient()],
		fetchOptions: {
			customFetchImpl,
			headers,
		},
		baseURL: "http://localhost:3000",
	});

	it("should sign in anonymously", async () => {
		const anonUser = await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		const userId = anonUser.data?.user.id;
		const email = anonUser.data?.user.email;
		const isAnonymous = anonUser.data?.user.isAnonymous;
		const sessionId = anonUser.data?.session.id;
		expect(userId).toBeDefined();
		expect(email?.endsWith("localhost:3000")).toBeTruthy();
		expect(isAnonymous).toBeTruthy();
		expect(sessionId).toBeDefined();
	});

	it("link anonymous user account", async () => {
		await client.signIn.email(testUser, {
			headers,
		});
		expect(linkAccountFn).toHaveBeenCalled();
	});
});
