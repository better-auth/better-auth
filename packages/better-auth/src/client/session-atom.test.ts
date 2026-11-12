// @vitest-environment node

import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";

type SessionState = {
	isPending: boolean;
	isRefetching: boolean;
	signedIn: boolean;
};

beforeEach(() => {
	const window = new Window({ url: "http://localhost:3000" });
	vi.stubGlobal("window", window);
	vi.stubGlobal("document", window.document);
	vi.stubGlobal("navigator", window.navigator);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

type Client = Awaited<ReturnType<typeof getTestInstance>>["client"];

function recordSession(client: Client) {
	const states: SessionState[] = [];
	const unsubscribe = client.useSession.subscribe((state) => {
		states.push({
			isPending: state.isPending,
			isRefetching: state.isRefetching,
			signedIn: state.data !== null,
		});
	});
	const settled = () =>
		vi.waitFor(() => {
			expect(states.at(-1)).toMatchObject({
				isPending: false,
				isRefetching: false,
			});
		});
	return {
		states,
		settled,
		unsubscribe,
	};
}

/**
 * @see https://github.com/better-auth/better-auth/issues/12074
 */
describe("session refetch while signed out", () => {
	it("keeps isPending false and reports the refetch through isRefetching", async () => {
		const { client } = await getTestInstance();
		const { states, settled, unsubscribe } = recordSession(client);
		await settled();
		expect(states.at(-1)?.signedIn).toBe(false);

		states.length = 0;
		await client.useSession.get().refetch();
		await settled();
		unsubscribe();

		expect(states).toContainEqual({
			isPending: false,
			isRefetching: true,
			signedIn: false,
		});
		expect(states).not.toContainEqual(
			expect.objectContaining({ isPending: true }),
		);
	});
});

describe("session after sign-in", () => {
	it("stays pending from sign-in success until the new session arrives", async () => {
		const { client, testUser, signInWithTestUser, sessionSetter } =
			await getTestInstance();
		// Reuse the test user's request context with an empty cookie jar, so the
		// sign-in below starts signed out and its session refetch sends the cookie.
		const { headers, runWithUser } = await signInWithTestUser();
		headers.delete("cookie");

		await runWithUser(async () => {
			const { states, settled, unsubscribe } = recordSession(client);
			await settled();
			expect(states.at(-1)?.signedIn).toBe(false);

			states.length = 0;
			let inOnSuccess: SessionState | undefined;
			await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
				fetchOptions: {
					onSuccess(context) {
						sessionSetter(headers)(context);
						const state = client.useSession.get();
						inOnSuccess = {
							isPending: state.isPending,
							isRefetching: state.isRefetching,
							signedIn: state.data !== null,
						};
					},
				},
			});
			const afterSignIn = client.useSession.get();
			expect(inOnSuccess).toMatchObject({
				isPending: true,
				signedIn: false,
			});
			expect(afterSignIn.isPending).toBe(true);
			expect(afterSignIn.data).toBeNull();

			await settled();
			unsubscribe();

			expect(states.at(-1)).toEqual({
				isPending: false,
				isRefetching: false,
				signedIn: true,
			});
			// A settled signed-out state in between would bounce guarded pages back to sign-in.
			expect(states).not.toContainEqual({
				isPending: false,
				isRefetching: false,
				signedIn: false,
			});
		});
	});
});
