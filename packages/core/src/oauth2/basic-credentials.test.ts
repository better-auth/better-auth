import { describe, expect, it } from "vitest";
import {
	decodeBasicCredentials,
	encodeBasicCredentials,
} from "./basic-credentials";

describe("encode/decodeBasicCredentials", () => {
	it("round-trips simple ASCII credentials", () => {
		const header = encodeBasicCredentials("alice", "s3cret");
		expect(header.startsWith("Basic ")).toBe(true);
		expect(decodeBasicCredentials(header)).toEqual({
			clientId: "alice",
			clientSecret: "s3cret",
		});
	});

	it("round-trips credentials containing reserved characters", () => {
		const clientId = "id:with/special@chars";
		const clientSecret = "secret with spaces & symbols+";
		const header = encodeBasicCredentials(clientId, clientSecret);
		expect(decodeBasicCredentials(header)).toEqual({ clientId, clientSecret });
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
		const payload = Buffer.from("idonly").toString("base64");
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

	it("rejects a Basic payload with malformed percent-encoding", () => {
		const payload = Buffer.from("id:%ZZ").toString("base64");
		expect(() => decodeBasicCredentials(`Basic ${payload}`)).toThrow(
			/percent-encoded/,
		);
	});
});
