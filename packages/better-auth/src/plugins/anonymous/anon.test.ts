import { describe, expect, it } from "vitest";
import { anonymous } from ".";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthClient } from "../../client";
import { anonymousClient } from "./client";

describe("anonymous", async () => {
	const { customFetchImpl, sessionSetter } = await getTestInstance({
		plugins: [anonymous()],
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
		const linkedAccount = await client.user.linkAnonymous({
			email: "valid-email@email.com",
			password: "valid-password",
		});
		expect(linkedAccount.data?.user).toBeDefined();
		expect(linkedAccount.data?.session).toBeDefined();
	});

	it("should sign in after link", async () => {
		const anonUser = await client.signIn.email({
			email: "valid-email@email.com",
			password: "valid-password",
		});
		expect(anonUser.data?.user.id).toBeDefined();
	});
});
