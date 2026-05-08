import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

const makeHook = () => {
	const encrypt = vi.fn(
		async (plaintext: string) =>
			`mock:${Buffer.from(plaintext, "utf8").toString("base64")}`,
	);
	const decrypt = vi.fn(async (ciphertext: string) => {
		if (!ciphertext.startsWith("mock:")) throw new Error("not a mock token");
		return Buffer.from(ciphertext.slice("mock:".length), "base64").toString(
			"utf8",
		);
	});
	return { encrypt, decrypt };
};

describe("custom crypto hook for JWE session cookie cache", async () => {
	it("encrypts the session cookie via the hook and decrypts via the hook", async () => {
		const hook = makeHook();
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: { cookieCache: { enabled: true, strategy: "jwe" } },
			crypto: hook,
		});

		const headers = new Headers();
		await client.signIn.email(
			{ email: testUser.email, password: testUser.password },
			{ onSuccess: cookieSetter(headers) },
		);

		expect(hook.encrypt).toHaveBeenCalled();
		// Inspect the actual session_data cookie that was just set.
		const cookie = headers.get("cookie") ?? "";
		const sessionDataMatch = cookie.match(
			/(?:^|;\s*)[^;=\s]*session_data=([^;]+)/,
		);
		expect(sessionDataMatch).not.toBeNull();
		const value = decodeURIComponent(sessionDataMatch![1]!);
		expect(value.startsWith("mock:")).toBe(true);

		const session = await client.getSession({ fetchOptions: { headers } });
		expect(session.data?.user.email).toBe(testUser.email);
		expect(hook.decrypt).toHaveBeenCalled();
	});

	it("treats an expired hook payload as no cache (decrypt returns null)", async () => {
		const hook = {
			encrypt: vi.fn(async (plaintext: string) => {
				const obj = JSON.parse(plaintext);
				obj.exp = ((Date.now() / 1000) | 0) - 3600;
				return `mock:${Buffer.from(JSON.stringify(obj), "utf8").toString(
					"base64",
				)}`;
			}),
			decrypt: vi.fn(async (ciphertext: string) =>
				Buffer.from(ciphertext.slice("mock:".length), "base64").toString(
					"utf8",
				),
			),
		};
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: { cookieCache: { enabled: true, strategy: "jwe" } },
			crypto: hook,
		});

		const headers = new Headers();
		await client.signIn.email(
			{ email: testUser.email, password: testUser.password },
			{ onSuccess: cookieSetter(headers) },
		);

		const session = await client.getSession({ fetchOptions: { headers } });
		// Expired cache: matches built-in behavior in session.ts — null result.
		expect(session.data).toBeNull();
		expect(hook.decrypt).toHaveBeenCalled();
	});

	it("does not call the hook when strategy is 'compact'", async () => {
		const hook = makeHook();
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: { cookieCache: { enabled: true, strategy: "compact" } },
			crypto: hook,
		});
		const headers = new Headers();
		await client.signIn.email(
			{ email: testUser.email, password: testUser.password },
			{ onSuccess: cookieSetter(headers) },
		);
		await client.getSession({ fetchOptions: { headers } });
		expect(hook.encrypt).not.toHaveBeenCalled();
		expect(hook.decrypt).not.toHaveBeenCalled();
	});

	it("returns null when the hook's decrypt throws", async () => {
		const hook = {
			encrypt: vi.fn(
				async (plaintext: string) =>
					`mock:${Buffer.from(plaintext, "utf8").toString("base64")}`,
			),
			decrypt: vi.fn(async () => {
				throw new Error("vault unreachable");
			}),
		};
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: { cookieCache: { enabled: true, strategy: "jwe" } },
			crypto: hook,
		});

		const headers = new Headers();
		await client.signIn.email(
			{ email: testUser.email, password: testUser.password },
			{ onSuccess: cookieSetter(headers) },
		);

		const session = await client.getSession({ fetchOptions: { headers } });
		expect(session.data).toBeNull();
		expect(hook.decrypt).toHaveBeenCalled();
	});

	it("stores hook ciphertext directly (no JWE wrapping)", async () => {
		const hook = makeHook();
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: { cookieCache: { enabled: true, strategy: "jwe" } },
			crypto: hook,
		});

		const headers = new Headers();
		await client.signIn.email(
			{ email: testUser.email, password: testUser.password },
			{ onSuccess: cookieSetter(headers) },
		);

		const cookie = headers.get("cookie") ?? "";
		const sessionDataMatch = cookie.match(
			/(?:^|;\s*)[^;=\s]*session_data=([^;]+)/,
		);
		expect(sessionDataMatch).not.toBeNull();
		const value = decodeURIComponent(sessionDataMatch![1]!);
		// Bypassed JWE codec: cookie must NOT be a compact JWS/JWE (eyJ...).
		expect(value.startsWith("eyJ")).toBe(false);
		expect(value.startsWith("mock:")).toBe(true);
		// And the plaintext that the hook encrypted must be the JSON envelope
		// — confirming the JWE codec did not run before the hook.
		const lastEncryptArg = hook.encrypt.mock.calls.at(-1)?.[0] ?? "";
		expect(() => JSON.parse(lastEncryptArg)).not.toThrow();
		const envelope = JSON.parse(lastEncryptArg);
		expect(envelope).toMatchObject({ session: expect.any(Object) });
		expect(typeof envelope.exp).toBe("number");
		expect(typeof envelope.iat).toBe("number");
		expect(typeof envelope.jti).toBe("string");
	});

	it("calls the hook's decrypt on every cached getSession (cache hits)", async () => {
		const hook = makeHook();
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: { cookieCache: { enabled: true, strategy: "jwe" } },
			crypto: hook,
		});

		const headers = new Headers();
		await client.signIn.email(
			{ email: testUser.email, password: testUser.password },
			{ onSuccess: cookieSetter(headers) },
		);

		const before = hook.decrypt.mock.calls.length;
		await client.getSession({ fetchOptions: { headers } });
		await client.getSession({ fetchOptions: { headers } });
		await client.getSession({ fetchOptions: { headers } });
		expect(hook.decrypt.mock.calls.length - before).toBe(3);
	});

	it("rejects payloads tampered with after the hook encrypted them", async () => {
		// Real-world property: the hook is the security boundary. If we hand
		// it a corrupted token and it throws, getSession must return null —
		// not silently fall back to a built-in codec.
		const hook = {
			encrypt: vi.fn(
				async (plaintext: string) =>
					`mock:${Buffer.from(plaintext, "utf8").toString("base64")}`,
			),
			decrypt: vi.fn(async (ciphertext: string) => {
				if (!ciphertext.startsWith("mock:")) {
					throw new Error("invalid ciphertext");
				}
				return Buffer.from(ciphertext.slice("mock:".length), "base64").toString(
					"utf8",
				);
			}),
		};
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: { cookieCache: { enabled: true, strategy: "jwe" } },
			crypto: hook,
		});

		const headers = new Headers();
		await client.signIn.email(
			{ email: testUser.email, password: testUser.password },
			{ onSuccess: cookieSetter(headers) },
		);

		const tampered = new Headers(headers);
		const cookie = (tampered.get("cookie") ?? "").replace(
			/session_data=[^;]+/,
			"session_data=garbage-not-a-mock-token",
		);
		tampered.set("cookie", cookie);

		const session = await client.getSession({
			fetchOptions: { headers: tampered },
		});
		expect(session.data).toBeNull();
	});
});
