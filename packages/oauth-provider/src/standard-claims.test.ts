import type { User } from "better-auth/types";
import { describe, expect, it } from "vitest";
import { STANDARD_CLAIMS } from "./standard-claims";

/**
 * Builds a user whose `name` is whatever the database actually holds. `name` is
 * typed as a string, but the column is nullable in practice, so the cast is the
 * point of these tests rather than a shortcut around the type.
 */
function userNamed(name: unknown): User {
	return {
		id: "user-id",
		name,
		email: "ada@example.com",
		emailVerified: true,
		image: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	} as unknown as User;
}

const givenName = (name: unknown) =>
	STANDARD_CLAIMS.given_name.resolve(userNamed(name));
const familyName = (name: unknown) =>
	STANDARD_CLAIMS.family_name.resolve(userNamed(name));

describe("STANDARD_CLAIMS", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/11193
	 */
	describe("given_name and family_name", () => {
		it("splits a two-part display name", () => {
			expect(givenName("Ada Lovelace")).toBe("Ada");
			expect(familyName("Ada Lovelace")).toBe("Lovelace");
		});

		it("treats every part but the last as the given name", () => {
			expect(givenName("Ada King Lovelace")).toBe("Ada King");
			expect(familyName("Ada King Lovelace")).toBe("Lovelace");
		});

		it("omits both claims for a single-word name", () => {
			expect(givenName("Ada")).toBeUndefined();
			expect(familyName("Ada")).toBeUndefined();
		});

		it("omits both claims when the name is null", () => {
			expect(givenName(null)).toBeUndefined();
			expect(familyName(null)).toBeUndefined();
		});

		it("omits both claims when the name is undefined", () => {
			expect(givenName(undefined)).toBeUndefined();
			expect(familyName(undefined)).toBeUndefined();
		});

		it("omits both claims for a blank name", () => {
			expect(givenName("   ")).toBeUndefined();
			expect(familyName("   ")).toBeUndefined();
		});
	});

	describe("name", () => {
		it("omits the claim when the name is null", () => {
			expect(STANDARD_CLAIMS.name.resolve(userNamed(null))).toBeUndefined();
		});
	});
});
