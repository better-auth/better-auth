import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oneTimeToken } from ".";
import { APIError } from "better-call";
import { oneTimeTokenClient } from "./client";

describe("One-time token", async () => {
	const { auth, signInWithTestUser, client } = await getTestInstance(
		{
			plugins: [oneTimeToken()],
		},
		{
			clientOptions: {
				plugins: [oneTimeTokenClient()],
			},
		},
	);
	it("should work", async () => {
		const { headers } = await signInWithTestUser();
		const response = await auth.api.generateOneTimeToken({
			headers,
		});
		expect(response.token).toBeDefined();
		const session = await auth.api.verifyOneTimeToken({
			body: {
				token: response.token,
			},
		});
		expect(session).toBeDefined();
		const shouldFail = await auth.api
			.verifyOneTimeToken({
				body: {
					token: response.token,
				},
			})
			.catch((e) => e);
		expect(shouldFail).toBeInstanceOf(APIError);
	});

	it("should expire", async () => {
		const { headers } = await signInWithTestUser();
		const response = await auth.api.generateOneTimeToken({
			headers,
		});
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
		const shouldFail = await auth.api
			.verifyOneTimeToken({
				body: {
					token: response.token,
				},
			})
			.catch((e) => e);
		expect(shouldFail).toBeInstanceOf(APIError);
		vi.useRealTimers();
	});

	it("should work with client", async () => {
		const { headers } = await signInWithTestUser();
		const response = await client.oneTimeToken.generate({
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(response.token).toBeDefined();
		const session = await client.oneTimeToken.verify({
			token: response.token,
		});
		expect(session.data?.session).toBeDefined();
	});
});
