import type { JoinConfig, JoinOption } from "better-auth/adapters";
import type { GoogleProfile } from "better-auth/social-providers";
import { describe, expectTypeOf, it } from "vitest";

describe("type exports", () => {
	it("should export JoinOption", () => {
		expectTypeOf<JoinOption>().not.toBeAny();
	});

	it("should export JoinConfig", () => {
		expectTypeOf<JoinConfig>().not.toBeAny();
	});

	it("should export GoogleProfile", () => {
		expectTypeOf<GoogleProfile>().not.toBeAny();
	});
});
