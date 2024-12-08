import { describe, expect, it, vi } from "vitest";
import { anonymous } from ".";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthClient } from "../../client";
import { anonymousClient } from "./client";

describe("anonymous", async () => {
	const linkAccountFn = vi.fn();
	const { customFetchImpl, auth, sessionSetter, testUser } =
		await getTestInstance({
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
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.session).toBeDefined();
		expect(anonUser.data?.user.isAnonymous).toBe(true);
	});

	it("link anonymous user account", async () => {
		await client.signIn.email(testUser, {
			headers,
		});
		expect(linkAccountFn).toHaveBeenCalledWith(expect.any(Object));
	});
});
