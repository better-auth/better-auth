import { describe, expect, it } from "vitest";
import {
	decodeBasicCredentials,
	encodeBasicCredentials,
} from "./basic-credentials";

describe("encode/decodeBasicCredentials", () => {
	it("round-trips simple ASCII credentials", () => {
		const header = encodeBasicCredentials("alice", "secret");
		expect(header.startsWith("Basic ")).toBe(true);
		expect(decodeBasicCredentials(header)).toEqual({
			clientId: "alice",
			clientSecret: "secret",
		});
	});

	it("round-trips credentials containing reserved characters", () => {
		const clientId = "id:with/special@chars";
		const clientSecret = "secret with spaces & symbols+";
		const header = encodeBasicCredentials(clientId, clientSecret);
		expect(decodeBasicCredentials(header)).toEqual({ clientId, clientSecret });
	});

	it("uses application/x-www-form-urlencoded for each value (escapes `!'()*`, space → `+`)", () => {
		// Computed independently via URLSearchParams to avoid mirroring the
		// implementation's encoding choice. This is the contract RFC 6749 §2.3.1
		// requires; encodeURIComponent leaves `!'()*` unescaped and would fail.
		const clientId = "alice!*'";
		const clientSecret = "p@ss word (1)";
		const header = encodeBasicCredentials(clientId, clientSecret);

		const expectedClientId = "alice%21*%27";
		const expectedClientSecret = "p%40ss+word+%281%29";
		const payload = `${expectedClientId}:${expectedClientSecret}`;
		const expectedHeader = `Basic ${Buffer.from(payload).toString("base64")}`;

		expect(header).toBe(expectedHeader);
		expect(decodeBasicCredentials(header)).toEqual({ clientId, clientSecret });
	});

	it("decodes `+` and `%20` symmetrically as space", () => {
		const plusEncoded = `Basic ${Buffer.from("user:hello+world").toString("base64")}`;
		const percentEncoded = `Basic ${Buffer.from("user:hello%20world").toString("base64")}`;
		expect(decodeBasicCredentials(plusEncoded).clientSecret).toBe(
			"hello world",
		);
		expect(decodeBasicCredentials(percentEncoded).clientSecret).toBe(
			"hello world",
		);
	});

	it("round-trips a client secret that contains a colon", () => {
		const clientId = "id";
		const clientSecret = "abc:def:ghi";
		const header = encodeBasicCredentials(clientId, clientSecret);
		expect(decodeBasicCredentials(header)).toEqual({ clientId, clientSecret });
	});

	it("round-trips credentials containing non-ASCII text", () => {
		const clientId = "クライアント";
		const clientSecret = "🔑secret";
		const header = encodeBasicCredentials(clientId, clientSecret);
		expect(decodeBasicCredentials(header)).toEqual({ clientId, clientSecret });
	});

	it("rejects an authorization header without the Basic prefix", () => {
		expect(() => decodeBasicCredentials("Bearer abc")).toThrow(
			/not a Basic credential/,
		);
	});

	it("rejects a Basic payload without a separator", () => {
		const payload = Buffer.from("missing-colon").toString("base64");
		expect(() => decodeBasicCredentials(`Basic ${payload}`)).toThrow(
			/separator/,
		);
	});

	it("rejects a Basic payload with an empty client id", () => {
		const payload = Buffer.from(":secret").toString("base64");
		expect(() => decodeBasicCredentials(`Basic ${payload}`)).toThrow(
			/non-empty/,
		);
	});

	it("rejects a Basic payload with an empty client secret", () => {
		const payload = Buffer.from("id:").toString("base64");
		expect(() => decodeBasicCredentials(`Basic ${payload}`)).toThrow(
			/non-empty/,
		);
	});

	it("passes invalid percent-encoding through untouched (URL Standard form-url-decoding is lenient)", () => {
		// A malformed credential won't match any stored client and the server
		// will fail at lookup time with `invalid_client`. The decoder itself
		// does not need to reject — that matches the URL Living Standard.
		const payload = Buffer.from("id:%ZZ").toString("base64");
		expect(decodeBasicCredentials(`Basic ${payload}`)).toEqual({
			clientId: "id",
			clientSecret: "%ZZ",
		});
	});
});
