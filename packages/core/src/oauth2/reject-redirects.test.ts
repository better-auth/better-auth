import { describe, expect, it } from "vitest";
import { BetterAuthError } from "../error";
import { assertResponseNotRedirect } from "./reject-redirects";

const fakeResponse = (init: { type?: string; status: number }): Response =>
	({ type: "basic", ...init }) as unknown as Response;

describe("assertResponseNotRedirect", () => {
	it("throws on a 3xx status (undici-style manual redirect)", () => {
		for (const status of [301, 302, 303, 307, 308]) {
			expect(() =>
				assertResponseNotRedirect(
					"https://idp.example/token",
					fakeResponse({ status }),
				),
			).toThrow(BetterAuthError);
		}
	});

	it("throws on an opaque redirect (spec-runtime manual redirect)", () => {
		expect(() =>
			assertResponseNotRedirect(
				"https://idp.example/token",
				fakeResponse({ type: "opaqueredirect", status: 0 }),
			),
		).toThrow(BetterAuthError);
	});

	it("does not throw on a non-redirect response", () => {
		for (const status of [200, 304, 400, 401]) {
			expect(() =>
				assertResponseNotRedirect(
					"https://idp.example/token",
					fakeResponse({ status }),
				),
			).not.toThrow();
		}
	});
});
