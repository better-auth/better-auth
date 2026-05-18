import { describe, expect, it } from "vitest";
import { getAuthorizationToken } from "./index";

describe("getAuthorizationToken", () => {
	it("extracts Bearer and DPoP scheme tokens", () => {
		expect(getAuthorizationToken("Bearer bearer-token")).toBe("bearer-token");
		expect(getAuthorizationToken("DPoP dpop-token")).toBe("dpop-token");
		expect(getAuthorizationToken("dpop lowercase-token")).toBe(
			"lowercase-token",
		);
	});

	it("preserves raw token values for backwards compatibility", () => {
		expect(getAuthorizationToken("raw-token")).toBe("raw-token");
		expect(getAuthorizationToken(null)).toBeNull();
		expect(getAuthorizationToken(undefined)).toBeUndefined();
	});
});
