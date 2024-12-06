import { expect, test } from "vitest";
import { base64 } from "./base64";

test("encodeBase64()", () => {
	expect(base64.encode(new Uint8Array())).toBe("");
	for (let i = 1; i <= 100; i++) {
		const bytes = new Uint8Array(i);
		crypto.getRandomValues(bytes);
		expect(base64.encode(bytes)).toBe(Buffer.from(bytes).toString("base64"));
	}
});

test("encodeBase64NoPadding()", () => {
	expect(base64.encode(new Uint8Array())).toBe("");
	for (let i = 1; i <= 100; i++) {
		const bytes = new Uint8Array(i);
		crypto.getRandomValues(bytes);
		expect(
			base64.encode(bytes, {
				ignorePadding: true,
			}),
		).toBe(base64.encode(bytes).replaceAll("=", ""));
	}
});

test("decodeBase64()", () => {
	expect(base64.decode("")).toStrictEqual(new Uint8Array());
	for (let i = 1; i <= 100; i++) {
		const bytes = new Uint8Array(i);
		crypto.getRandomValues(bytes);
		expect(base64.decode(base64.encode(bytes))).toStrictEqual(bytes);
	}
});

test("decodeBase64IgnorePadding()", () => {
	expect(
		base64.decode("", {
			ignorePadding: true,
		}),
	).toStrictEqual(new Uint8Array());
	for (let i = 1; i <= 100; i++) {
		const bytes = new Uint8Array(i);
		crypto.getRandomValues(bytes);
		expect(
			base64.decode(
				base64.encode(bytes, {
					ignorePadding: true,
				}),
				{
					ignorePadding: true,
				},
			),
		).toStrictEqual(bytes);
	}
	// includes padding but invalid padding count
	for (let i = 1; i <= 100; i++) {
		const bytes = new Uint8Array(i);
		crypto.getRandomValues(bytes);
		expect(
			base64.decode(base64.encode(bytes).replace("=", ""), {
				ignorePadding: true,
			}),
		).toStrictEqual(bytes);
	}
});

test("decodeBase64() throws on invalid padding", () => {
	expect(() => base64.decode("qqo")).toThrowError();
	expect(() => base64.decode("qqp=")).toThrowError();
	expect(() => base64.decode("q===")).toThrowError();
	expect(() => base64.decode("====")).toThrowError();
	expect(() => base64.decode("=")).toThrowError();
	expect(() => base64.decode("q=q=")).toThrowError();
	expect(() => base64.decode("qqqqq===")).toThrowError();
	expect(() => base64.decode("qqqq====")).toThrowError();
	expect(() => base64.decode("qqqqq=qq")).toThrowError();
});
