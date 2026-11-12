import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { kElectron } from "../src/authenticate";
import { electronClient } from "../src/client";
import { electron } from "../src/index";
import { encodeRedirectToken } from "./utils";

const mockElectron = vi.hoisted(() => {
	const electron = {
		app: {
			userAgentFallback: "test-user-agent",
			whenReady: vi.fn(() => Promise.resolve()),
			setAsDefaultProtocolClient: vi.fn(() => true),
			requestSingleInstanceLock: vi.fn(() => true),
			on: vi.fn<
				(event: string, listener: (...args: unknown[]) => unknown) => void
			>(),
			quit: vi.fn(),
		},
		protocol: { registerSchemesAsPrivileged: vi.fn() },
		shell: { openExternal: vi.fn(async (_url: string) => {}) },
		safeStorage: {
			isEncryptionAvailable: () => true,
			encryptString: (value: string) => Buffer.from(value),
			decryptString: (value: Buffer) => value.toString(),
		},
		webContents: { getFocusedWebContents: () => null },
		BrowserWindow: { getAllWindows: () => [] },
	};
	return { ...electron, default: electron };
});

vi.mock("electron", () => mockElectron);

afterEach(() => {
	Reflect.deleteProperty(globalThis, kElectron);
	vi.unstubAllGlobals();
});

async function startAuthentication(
	platform: "win32" | "linux" | "darwin" = "win32",
	callbackPath = "/auth/callback",
) {
	vi.stubGlobal(
		"process",
		Object.create(process, {
			type: { value: "browser" },
			platform: { value: platform },
			defaultApp: { value: false },
			argv: { value: ["app.exe"] },
		}),
	);
	const storage = new Map<string, unknown>();
	const { auth, client, testUser } = await getTestInstance(
		{ plugins: [electron()], trustedOrigins: ["myapp:/"] },
		{
			clientOptions: {
				plugins: [
					electronClient({
						protocol: { scheme: "myapp" },
						callbackPath,
						signInURL: "http://localhost:3000/sign-in",
						userImageProxy: { enabled: false },
						storage: {
							getItem: (key) => storage.get(key) ?? null,
							setItem: (key, value) => {
								storage.set(key, value);
							},
						},
					}),
				],
			},
		},
	);
	await client.requestAuth();
	const request = new URL(
		mockElectron.shell.openExternal.mock.calls.at(-1)![0],
	);
	const state = request.searchParams.get("state")!;
	const signIn = await auth.api.signInEmail({
		body: { email: testUser.email, password: testUser.password },
		query: {
			client_id: "electron",
			code_challenge: request.searchParams.get("code_challenge")!,
			state,
		},
	});
	const { electron_authorization_code: identifier } =
		signIn as typeof signIn & {
			electron_authorization_code: string;
		};
	expect(identifier).toBeTypeOf("string");
	const callback = `myapp:/${callbackPath}#token=${encodeRedirectToken(identifier, state)}`;
	const setup = () =>
		client.setupMain({
			scheme: true,
			csp: false,
			bridges: false,
			getWindow: () => null,
		});
	const dispatch = async (event: string, ...args: unknown[]) => {
		const listener = mockElectron.app.on.mock.calls.findLast(
			([name]) => name === event,
		)?.[1];
		expect(listener).toBeDefined();
		await listener!({}, ...args);
	};
	const expectSignedIn = async () => {
		const session = await client.getSession();
		expect(session.error).toBeNull();
		expect(session.data?.user.id).toBe(signIn.user.id);
	};
	return { callback, client, setup, dispatch, expectSignedIn };
}

/**
 * @see https://github.com/better-auth/better-auth/issues/12487
 * @see https://www.electronjs.org/docs/latest/api/app#event-second-instance
 */
describe.each(["win32", "linux"] as const)(
	"callback selection on %s",
	(platform) => {
		it.each([1, 2, 3])(
			"finds the callback at argument %i without mutating argv",
			async (position) => {
				const auth = await startAuthentication(platform);
				auth.setup();
				const argv = [
					"app.exe",
					"--original-process-start-time=123",
					"https://example.com",
				];
				argv.splice(position, 0, auth.callback);
				const original = [...argv];
				await auth.dispatch("second-instance", argv, ".");
				await auth.expectSignedIn();
				expect(argv).toEqual(original);
			},
		);

		it.each([
			null,
			{},
			{ url: "https://example.com", count: 1 },
			"https://example.com",
			"myapp://open",
		])("ignores unrelated additional data %j", async (data) => {
			const auth = await startAuthentication(platform);
			auth.setup();
			await auth.dispatch(
				"second-instance",
				["app.exe", auth.callback, "--flag"],
				".",
				data,
			);
			await auth.expectSignedIn();
		});

		it.each([
			{ name: "a string", wrap: (url: string) => url },
			{ name: "a url property", wrap: (url: string) => Object.freeze({ url }) },
			{
				name: "another string property",
				wrap: (url: string) =>
					Object.freeze({
						url: "https://example.com",
						count: 1,
						nested: { url },
						callback: url,
					}),
			},
		])(
			"accepts a callback supplied only in additional data as $name",
			async ({ wrap }) => {
				const auth = await startAuthentication(platform);
				auth.setup();
				await auth.dispatch(
					"second-instance",
					["app.exe", "--flag"],
					".",
					wrap(auth.callback),
				);
				await auth.expectSignedIn();
			},
		);

		it("handles a repeated callback candidate only once", async () => {
			const auth = await startAuthentication(platform);
			const error = vi.spyOn(console, "error").mockImplementation(() => {});
			auth.setup();
			await auth.dispatch(
				"second-instance",
				[auth.callback, auth.callback],
				".",
				{ url: auth.callback },
			);
			await auth.expectSignedIn();
			expect(error).not.toHaveBeenCalled();
		});

		it("ignores unrelated URLs without consuming the pending authentication", async () => {
			const auth = await startAuthentication(platform, "/oauth/finish");
			auth.setup();
			const unrelated = [
				"app.exe",
				"--flag",
				"https://example.com",
				"myapp://open",
				auth.callback.replace("myapp:", "other:"),
				auth.callback.replace("/finish", "/other"),
				"myapp://oauth/finish",
				"myapp://oauth/finish#other=value",
			];
			await auth.dispatch("second-instance", unrelated, ".", {});
			expect((await auth.client.getSession()).data).toBeNull();
			await auth.dispatch(
				"second-instance",
				[...unrelated, auth.callback, "--flag"],
				".",
			);
			await auth.expectSignedIn();
		});

		it("finds the startup callback between launch arguments", async () => {
			const auth = await startAuthentication(platform);
			process.argv.push(
				"--flag",
				auth.callback,
				"--original-process-start-time=123",
			);
			auth.setup();
			await vi.waitFor(auth.expectSignedIn);
		});
	},
);

it("keeps macOS callbacks on open-url", async () => {
	const auth = await startAuthentication("darwin");
	auth.setup();
	await auth.dispatch("second-instance", ["app.exe", auth.callback], ".");
	expect((await auth.client.getSession()).data).toBeNull();
	await auth.dispatch("open-url", auth.callback);
	await auth.expectSignedIn();
});
