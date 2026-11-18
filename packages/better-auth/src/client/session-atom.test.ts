// @vitest-environment node

import type { SuccessContext } from "@better-fetch/fetch";
import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";

type SessionState = {
	isPending: boolean;
	isRefetching: boolean;
	signedIn: boolean;
};

const signedIn: SessionState = {
	isPending: false,
	isRefetching: false,
	signedIn: true,
};

const signedOut: SessionState = {
	isPending: false,
	isRefetching: false,
	signedIn: false,
};

function toState(state: {
	isPending: boolean;
	isRefetching: boolean;
	data: unknown;
}): SessionState {
	return {
		isPending: state.isPending,
		isRefetching: state.isRefetching,
		signedIn: state.data !== null,
	};
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return {
		promise,
		resolve,
	};
}

// Yields a full task, so a refetch that does not wait for the caller runs first.
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve));

const test = it
	// The happy-dom environment hides `set-cookie` like a browser, so the test
	// server runs on Node and only the window the session atom listens to is stubbed.
	.extend("window", { auto: true }, ({}, { onCleanup }) => {
		const window = new Window({ url: "http://localhost:3000" });
		vi.stubGlobal("window", window);
		vi.stubGlobal("document", window.document);
		vi.stubGlobal("navigator", window.navigator);
		onCleanup(() => {
			vi.unstubAllGlobals();
		});
	})
	.extend("signedIn", false)
	.extend("instance", async ({ signedIn }) => {
		// The client keeps its own cookie jar, so a test controls when the
		// credentials from a sign-in become visible to session requests.
		const jar = new Headers();
		let persist = async (_context: SuccessContext) => {};
		let beforeSessionResponse = async () => {};
		let sessionRequests = 0;
		const instance = await getTestInstance(undefined, {
			clientOptions: {
				plugins: [
					{
						id: "cookie-jar",
						fetchPlugins: [
							{
								id: "cookie-jar",
								name: "cookie-jar",
								hooks: {
									onRequest(context) {
										const cookie = jar.get("cookie");
										if (cookie) context.headers.set("cookie", cookie);
										return context;
									},
									async onResponse(context) {
										if (
											!context.request.url.toString().endsWith("/get-session")
										)
											return;
										sessionRequests++;
										await beforeSessionResponse();
									},
									onSuccess: (context) => persist(context),
								},
							},
						],
					},
				],
			},
		});
		const setCookie = instance.sessionSetter(jar);
		if (signedIn) {
			await instance.client.signIn.email({
				email: instance.testUser.email,
				password: instance.testUser.password,
				fetchOptions: {
					onSuccess: setCookie,
				},
			});
		}
		return {
			...instance,
			setCookie,
			sessionRequests: () => sessionRequests,
			persistWith(next: typeof persist) {
				persist = next;
			},
			beforeSessionResponse(next: typeof beforeSessionResponse) {
				beforeSessionResponse = next;
			},
		};
	})
	// Every session state after the initial load, while a component reads it.
	.extend("states", async ({ instance: { client } }, { onCleanup }) => {
		const loaded: SessionState[] = [];
		const unsubscribe = client.useSession.subscribe((state) => {
			loaded.push(toState(state));
		});
		await settled(loaded);
		const states: SessionState[] = [];
		const unlisten = client.useSession.listen((state) => {
			states.push(toState(state));
		});
		onCleanup(() => {
			unlisten();
			unsubscribe();
		});
		return states;
	});

type Client = Awaited<ReturnType<typeof getTestInstance>>["client"];

function current(client: Client) {
	return toState(client.useSession.get());
}

// Waits for a recorded state, so a change that has not started yet is not
// mistaken for a settled one.
function settled(states: SessionState[]) {
	return expect
		.poll(() => states.at(-1))
		.toMatchObject({
			isPending: false,
			isRefetching: false,
		});
}

function expectNoSettledSignedOut(states: SessionState[]) {
	// A settled signed-out state would bounce guarded pages back to sign-in.
	expect(states).not.toContainEqual(signedOut);
}

/**
 * @see https://github.com/better-auth/better-auth/issues/12074
 */
describe("session refetch while signed out", () => {
	test("reports the refetch through isRefetching only", async ({
		instance: { client },
		states,
	}) => {
		expect(current(client)).toEqual(signedOut);

		await client.useSession.get().refetch();
		await settled(states);

		expect(states).toContainEqual({
			isPending: false,
			isRefetching: true,
			signedIn: false,
		});
		expect(states).not.toContainEqual(
			expect.objectContaining({ isPending: true }),
		);
	});

	test("stays settled when signing out", async ({
		instance: { client },
		states,
	}) => {
		await client.signOut();
		await settled(states);

		expect(states).not.toContainEqual(
			expect.objectContaining({ isPending: true }),
		);
	});
});

describe("session after sign-in", () => {
	test("resolves after the session loads with credentials stored in onSuccess", async ({
		instance: { client, testUser, setCookie },
		states,
	}) => {
		let pendingInOnSuccess: boolean | undefined;
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				async onSuccess(context) {
					pendingInOnSuccess = client.useSession.get().isPending;
					await nextTask();
					setCookie(context);
				},
			},
		});

		expect(pendingInOnSuccess).toBe(true);
		expect(current(client)).toEqual(signedIn);
		expectNoSettledSignedOut(states);
	});

	test("still loads the session when onSuccess throws", async ({
		instance: { client, testUser, setCookie, persistWith },
		states,
	}) => {
		persistWith(async (context) => {
			await nextTask();
			setCookie(context);
		});
		const failure = new Error("callback failed");

		await expect(
			client.signIn.email({
				email: testUser.email,
				password: testUser.password,
				fetchOptions: {
					onSuccess() {
						throw failure;
					},
				},
			}),
		).rejects.toBe(failure);

		expect(current(client)).toEqual(signedIn);
		expectNoSettledSignedOut(states);
	});

	test("holds back a refetch made before the credentials are stored", async ({
		instance: { client, testUser, setCookie },
		states,
	}) => {
		let refetched: SessionState | undefined;
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				async onSuccess(context) {
					// A focus refetch or a page mounting before the credentials exist.
					await client.useSession.get().refetch();
					refetched = current(client);
					setCookie(context);
				},
			},
		});

		expect(refetched).toMatchObject({
			isPending: true,
			signedIn: false,
		});
		expect(current(client)).toEqual(signedIn);
		expectNoSettledSignedOut(states);
	});

	test("discards a response requested before the sign-in", async ({
		instance: { client, testUser, setCookie, beforeSessionResponse },
		states,
	}) => {
		const requested = deferred();
		const response = deferred();
		beforeSessionResponse(async () => {
			requested.resolve();
			await response.promise;
		});
		const stale = client.useSession.get().refetch();
		await requested.promise;
		beforeSessionResponse(async () => {});

		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				async onSuccess(context) {
					// The signed-out response lands while the credentials are stored.
					response.resolve();
					await stale;
					setCookie(context);
				},
			},
		});

		expect(current(client)).toEqual(signedIn);
		expectNoSettledSignedOut(states);
	});

	test("loads the session only once something reads it", async ({
		instance: { client, testUser, setCookie, sessionRequests },
	}) => {
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess: setCookie,
			},
		});
		expect(sessionRequests()).toBe(0);

		const states: SessionState[] = [];
		const unsubscribe = client.useSession.subscribe((state) => {
			states.push(toState(state));
		});
		await settled(states);
		unsubscribe();

		expect(current(client)).toEqual(signedIn);
		expectNoSettledSignedOut(states);
	});

	test("ignores a store notification made during the sign-in", async ({
		instance: { client, testUser, setCookie },
		states,
	}) => {
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				async onSuccess(context) {
					// Fetch plugins report stored cookies the same way.
					client.$store.notify("$sessionSignal");
					await nextTask();
					setCookie(context);
				},
			},
		});

		expect(current(client)).toEqual(signedIn);
		expectNoSettledSignedOut(states);
	});

	test("resolves a nested auth call with the session loaded", async ({
		instance: { client, testUser, setCookie },
		states,
	}) => {
		let inner: SessionState | undefined;
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				async onSuccess() {
					await client.signIn.email({
						email: testUser.email,
						password: testUser.password,
						fetchOptions: {
							onSuccess: setCookie,
						},
					});
					inner = current(client);
				},
			},
		});

		expect(inner).toEqual(signedIn);
		expect(current(client)).toEqual(signedIn);
		expectNoSettledSignedOut(states);
	});

	test("resolves overlapping auth calls with the session loaded", async ({
		instance: { client, testUser, setCookie },
		states,
	}) => {
		const entered = deferred();
		const released = deferred();
		const first = client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				async onSuccess(context) {
					entered.resolve();
					await released.promise;
					setCookie(context);
				},
			},
		});
		await entered.promise;

		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess: setCookie,
			},
		});
		const afterSecond = current(client);
		released.resolve();
		await first;

		expect(afterSecond).toEqual(signedIn);
		expect(current(client)).toEqual(signedIn);
		expectNoSettledSignedOut(states);
	});

	test("waits for a request that replaced the sign-in refetch", async ({
		instance: { client, testUser, setCookie, beforeSessionResponse },
		states,
	}) => {
		let replaced = false;
		beforeSessionResponse(async () => {
			if (replaced) {
				// Let the replaced request finish first.
				await nextTask();
				return;
			}
			replaced = true;
			// A focus refetch lands while the sign-in waits for its request.
			void client.useSession.get().refetch();
		});

		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess: setCookie,
			},
		});

		expect(current(client)).toEqual(signedIn);
		expectNoSettledSignedOut(states);
	});

	test("settles signed out when the sign-in leaves no session", async ({
		instance: { client, testUser },
		states,
	}) => {
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});

		// The sign-in loads the session before it resolves, then stops loading.
		expect(states).toContainEqual(expect.objectContaining({ isPending: true }));
		expect(current(client)).toEqual(signedOut);
	});

	test("leaves the session untouched when the sign-in fails", async ({
		instance: { client, testUser, sessionRequests },
		states,
	}) => {
		const requestsBefore = sessionRequests();

		await client.signIn.email({
			email: testUser.email,
			password: "wrong-password",
		});

		expect(sessionRequests()).toBe(requestsBefore);
		expect(states).toEqual([]);
	});
});

describe("session after a data change", () => {
	test.override("signedIn", true);

	test("resolves with the updated session", async ({
		instance: { client },
		states,
	}) => {
		await client.updateUser({ name: "Renamed" });

		expect(client.useSession.get().data?.user.name).toBe("Renamed");
		expect(states).not.toContainEqual(
			expect.objectContaining({ isPending: true }),
		);
	});

	test("keeps the old session while an earlier request lands", async ({
		instance: { client },
		states,
	}) => {
		const earlier = client.useSession.get().refetch();
		await client.updateUser({
			name: "Renamed",
			fetchOptions: {
				async onSuccess() {
					await earlier;
				},
			},
		});

		expect(client.useSession.get().data?.user.name).toBe("Renamed");
		expect(states).not.toContainEqual(
			expect.objectContaining({ signedIn: false }),
		);
	});

	test("settles a refetch made while nothing reads the session", async ({
		instance: { client },
	}) => {
		// Only an unmounted atom skips the signal listener. Read it through
		// `value`, since `get()` would mount it.
		const session = client.$store.atoms.session!;
		await session.value.refetch();
		expect(session.value.data).not.toBeNull();

		await client.updateUser({
			name: "Renamed",
			fetchOptions: {
				async onSuccess() {
					await session.value.refetch();
				},
			},
		});

		expect(session.value).toMatchObject({
			isPending: false,
			isRefetching: false,
		});
		expect(session.value.data?.user.name).toBe("Renamed");
	});
});
