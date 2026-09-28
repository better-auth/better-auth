import { describe, expect, it } from "vitest";
import {
	getStoredSessionToken,
	hashSessionToken,
	isSessionTokenHashed,
} from "./session-token";

describe("session token hashing", () => {
	it("hashes with SHA-256 as unpadded base64url", async () => {
		// SHA-256("abc"), base64url without padding
		expect(await hashSessionToken("abc")).toBe(
			"ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0",
		);
	});

	it("only hashes when session.storeTokenHash is enabled", async () => {
		expect(isSessionTokenHashed({})).toBe(false);
		expect(isSessionTokenHashed({ session: { storeTokenHash: false } })).toBe(
			false,
		);
		expect(isSessionTokenHashed({ session: { storeTokenHash: true } })).toBe(
			true,
		);
		expect(await getStoredSessionToken({}, "abc")).toBe("abc");
		expect(
			await getStoredSessionToken({ session: { storeTokenHash: true } }, "abc"),
		).toBe(await hashSessionToken("abc"));
	});
});
