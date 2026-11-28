// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { getTestInstance } from "../test-utils/test-instance";
import { getGlobalBroadcastChannel } from "./broadcast-channel";
import { createAuthClient as createVueClient } from "./vue";

afterEach(() => {
	vi.unstubAllEnvs();
});

it("should call '/api/auth' for vue client", async () => {
	const customFetchImpl = vi.fn(async (url: string | Request | URL) => {
		expect(url).toBe("/api/auth/get-session");
		return new Response();
	});
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	// use DisposableStack when Node.js 24 is the minimum requirement
	using _ = {
		[Symbol.dispose]() {
			process.env.BETTER_AUTH_URL = undefined;
		},
	};
	const client = createVueClient({
		fetchOptions: {
			customFetchImpl,
		},
	});
	await client.getSession();
	expect(customFetchImpl).toBeCalled();
});

it.for([
	{ name: "VERCEL_URL", value: "my-app.vercel.app" },
	{ name: "NEXTAUTH_URL", value: "https://example.com" },
	{ name: "NEXT_PUBLIC_AUTH_URL", value: "https://example.com/api/auth" },
])(
	"keeps the vue session fetch relative when $name is set",
	({ name, value }) => {
		vi.stubEnv(name, value);
		const pendingFetch = new Promise<never>(() => undefined);
		const useFetch = vi.fn(() => pendingFetch);
		const client = createVueClient();

		void client.useSession(useFetch);

		expect(useFetch).toHaveBeenCalledWith(
			"/api/auth/get-session",
			expect.anything(),
		);
	},
);

it.for([
	{ basePath: "/auth", url: "/auth/get-session" },
	{ basePath: "/", url: "/get-session" },
	{ basePath: "auth/", url: "/auth/get-session" },
])("keeps the vue session fetch on basePath $basePath", ({ basePath, url }) => {
	const pendingFetch = new Promise<never>(() => undefined);
	const useFetch = vi.fn(() => pendingFetch);
	const client = createVueClient({
		basePath,
	});

	void client.useSession(useFetch);

	expect(useFetch).toHaveBeenCalledWith(url, expect.anything());
});

/**
 * @see https://github.com/better-auth/better-auth/issues/5358
 */
it("uses stable Nuxt options for a session fetch", () => {
	const headers = {
		cookie: "better-auth.session_token=session",
		"x-optional": undefined,
	};
	const pendingFetch = new Promise<never>(() => undefined);
	const useFetch = vi.fn(() => pendingFetch);
	const client = createVueClient({
		baseURL: "http://localhost:3000",
		fetchOptions: { headers },
	});

	void client.useSession(useFetch);

	expect(useFetch).toHaveBeenCalledWith(
		"http://localhost:3000/api/auth/get-session",
		{
			headers: { cookie: "better-auth.session_token=session" },
			key: "better-auth:session:http://localhost:3000:/api/auth",
			watch: [expect.anything()],
		},
	);
});

/**
 * @see https://github.com/better-auth/better-auth/issues/5358
 */
it.each([
	[
		"Headers",
		new Headers({ cookie: "better-auth.session_token=session" }),
		new Headers({ cookie: "better-auth.session_token=session" }),
	],
	[
		"tuple array",
		[["cookie", "better-auth.session_token=session"]] satisfies [
			string,
			string,
		][],
		[["cookie", "better-auth.session_token=session"]] satisfies [
			string,
			string,
		][],
	],
])(
	"preserves %s for a Nuxt session fetch",
	(_name, headers, expectedHeaders) => {
		const pendingFetch = new Promise<never>(() => undefined);
		const useFetch = vi.fn(() => pendingFetch);
		const client = createVueClient({
			baseURL: "http://localhost:3000",
			fetchOptions: { headers },
		});

		void client.useSession(useFetch);

		expect(useFetch).toHaveBeenCalledWith(
			"http://localhost:3000/api/auth/get-session",
			{
				headers: expectedHeaders,
				key: "better-auth:session:http://localhost:3000:/api/auth",
				watch: [expect.anything()],
			},
		);
	},
);

/**
 * @see https://github.com/better-auth/better-auth/issues/12233
 */
it("does not subscribe session refresh listeners on the server", async () => {
	const { client } = await getTestInstance(undefined, {
		disableTestUser: true,
	});
	const subscribe = vi.spyOn(getGlobalBroadcastChannel(), "subscribe");

	// SSR mounts the session store but never unmounts it.
	client.useSession.listen(() => {});

	expect(subscribe).not.toHaveBeenCalled();
});

it("refetches the session on the server when the session signal fires", async () => {
	const { client } = await getTestInstance(undefined, {
		disableTestUser: true,
	});
	client.useSession.listen(() => {});

	// Electron's main process has no window and relies on this refetch.
	client.$store.notify("$sessionSignal");

	await vi.waitFor(() => {
		expect(client.useSession.get().isPending).toBe(false);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/12862
 */
it("does not leave atom listeners after Vue SSR with a module-level client", async () => {
	const authClient = createVueClient({ baseURL: "http://localhost:3000" });
	const atoms = authClient.$store.atoms;
	const fakeUseFetch = async () => ({
		data: { value: null },
		error: { value: null },
	});

	async function renderRequest() {
		const app = createSSRApp({
			async setup() {
				authClient.useSession();
				await authClient.useSession(fakeUseFetch);
				return () => h("div", "Hello");
			},
		});
		await renderToString(app);
	}

	// Warm up once so client-owned listeners are established, then assert
	// subsequent SSR renders do not accumulate atom subscriptions.
	await renderRequest();
	const sessionListenersAfterWarmup = atoms.session.lc;
	const signalListenersAfterWarmup = atoms.$sessionSignal.lc;

	for (let request = 0; request < 20; request++) {
		await renderRequest();
	}

	expect(atoms.session.lc).toBe(sessionListenersAfterWarmup);
	expect(atoms.$sessionSignal.lc).toBe(signalListenersAfterWarmup);
});
