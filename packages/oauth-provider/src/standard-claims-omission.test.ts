import type { User } from "better-auth/types";
import { describe, expect, it } from "vitest";
import { STANDARD_CLAIMS } from "./standard-claims";

function userWith(profile: { name?: string | null; image?: string | null }) {
	return {
		id: "user-id",
		email: "ada@example.com",
		emailVerified: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		name: "Ada Lovelace",
		image: null,
		...profile,
	} as User;
}

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#UserInfoResponse
 */
describe("STANDARD_CLAIMS omission of empty values", () => {
	it("omits an empty name", () => {
		expect(
			STANDARD_CLAIMS.name.resolve(userWith({ name: "" })),
		).toBeUndefined();
	});

	it("omits an empty picture", () => {
		expect(
			STANDARD_CLAIMS.picture.resolve(userWith({ image: "" })),
		).toBeUndefined();
	});

	it("omits a null picture", () => {
		expect(
			STANDARD_CLAIMS.picture.resolve(userWith({ image: null })),
		).toBeUndefined();
	});

	it("keeps non-empty values", () => {
		const user = userWith({ image: "https://example.com/ada.png" });
		expect(STANDARD_CLAIMS.name.resolve(user)).toBe("Ada Lovelace");
		expect(STANDARD_CLAIMS.picture.resolve(user)).toBe(
			"https://example.com/ada.png",
		);
	});

	it("leaves whitespace-only values unchanged", () => {
		const user = userWith({ name: " ", image: " " });
		expect(STANDARD_CLAIMS.name.resolve(user)).toBe(" ");
		expect(STANDARD_CLAIMS.picture.resolve(user)).toBe(" ");
	});

	it("keeps email_verified false as a value", () => {
		expect(STANDARD_CLAIMS.email_verified.resolve(userWith({}))).toBe(false);
	});
});
