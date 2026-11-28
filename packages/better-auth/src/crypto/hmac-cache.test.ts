import { base64Url } from "@better-auth/utils/base64";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCookieCache } from "../cookies";
import {
	getCryptoKey,
	makeSignature,
	signHmacSha256,
	verifyHmacSha256,
} from "./index";

describe("HMAC CryptoKey caching", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("imports a string secret only once across repeated getCryptoKey, makeSignature, and HMAC calls", async () => {
		const secret = `hmac-cache-test-secret-${Math.random()}-padding-32-chars`;
		const importKeySpy = vi.spyOn(globalThis.crypto.subtle, "importKey");

		const [key1, key2] = await Promise.all([
			getCryptoKey(secret),
			getCryptoKey(secret),
		]);
		expect(key1).toBe(key2);

		const sig1 = await makeSignature("payload-1", secret);
		const sig2 = await makeSignature("payload-2", secret);
		expect(sig1).toBeTruthy();
		expect(sig2).toBeTruthy();

		const hmacSig = await signHmacSha256(secret, "compact-payload");
		expect(await verifyHmacSha256(secret, "compact-payload", hmacSig)).toBe(
			true,
		);
		expect(await verifyHmacSha256(secret, "tampered-payload", hmacSig)).toBe(
			false,
		);

		const hmacImports = importKeySpy.mock.calls.filter(
			(call) =>
				call[0] === "raw" &&
				typeof call[2] === "object" &&
				call[2] !== null &&
				"name" in call[2] &&
				call[2].name === "HMAC",
		);
		expect(hmacImports).toHaveLength(1);
	});

	it("reuses the imported CryptoKey across repeated getCookieCache verifications", async () => {
		const secret = `cookie-cache-secret-${Math.random()}-padding-32-chars`;
		const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
		const sessionData = {
			session: {
				id: "s1",
				token: "session-token",
				userId: "u1",
				createdAt: new Date(),
				updatedAt: new Date(),
				expiresAt,
			},
			user: {
				id: "u1",
				email: "cache@test.com",
				emailVerified: true,
				name: "Cache User",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			updatedAt: Date.now(),
			version: "1",
		};
		const outerExpiresAt = Date.now() + 5 * 60 * 1000;
		const signature = await signHmacSha256(
			secret,
			JSON.stringify({ ...sessionData, expiresAt: outerExpiresAt }),
		);
		const encoded = base64Url.encode(
			JSON.stringify({ session: sessionData, expiresAt: outerExpiresAt, signature }),
			{ padding: false },
		);
		const makeRequest = () => {
			const headers = new Headers();
			headers.set("cookie", `better-auth.session_data=${encoded}`);
			return new Request("https://example.com/api/auth/session", { headers });
		};

		const importKeySpy = vi.spyOn(globalThis.crypto.subtle, "importKey");
		for (let i = 0; i < 5; i++) {
			const result = await getCookieCache(makeRequest(), { secret });
			expect(result?.user?.email).toBe("cache@test.com");
		}
		expect(importKeySpy).not.toHaveBeenCalled();
	});

	it("evicts least-recently-used secrets once cache capacity is exceeded without breaking verification", async () => {
		const promotedSecret = `evict-promoted-${Math.random()}-padding-32-chars`;
		const coldSecret = `evict-cold-${Math.random()}-padding-32-chars`;
		const promotedSig = await signHmacSha256(promotedSecret, "data");
		const coldSig = await signHmacSha256(coldSecret, "data");

		// Promote the older secret to most-recently-used before filling capacity.
		await getCryptoKey(promotedSecret);
		for (let i = 0; i < 63; i++) {
			await getCryptoKey(`evict-filler-${i}-${Math.random()}-32-chars`);
		}

		const importKeySpy = vi.spyOn(globalThis.crypto.subtle, "importKey");
		expect(await verifyHmacSha256(promotedSecret, "data", promotedSig)).toBe(
			true,
		);
		expect(importKeySpy).not.toHaveBeenCalled();

		expect(await verifyHmacSha256(coldSecret, "data", coldSig)).toBe(true);
		expect(importKeySpy).toHaveBeenCalledTimes(1);
	});

	it("evicts failed importKey promises so subsequent calls recover cleanly", async () => {
		const secret = `recover-secret-${Math.random()}-padding-32-chars`;
		const spy = vi
			.spyOn(globalThis.crypto.subtle, "importKey")
			.mockRejectedValueOnce(new Error("transient import failure"));

		await expect(getCryptoKey(secret)).rejects.toThrow(
			"transient import failure",
		);
		spy.mockRestore();

		const key = await getCryptoKey(secret);
		expect(key).toBeDefined();
	});
});
