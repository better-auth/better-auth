import { describe, expect, it } from "vitest";
import type { SecretConfig } from "../types/secret";
import { getSecretValues } from "./secret";

describe("getSecretValues", () => {
	it("returns a single string secret as a one-element list", () => {
		expect(getSecretValues("only-secret")).toEqual(["only-secret"]);
	});

	it("returns current first, then prior versions", () => {
		const config: SecretConfig = {
			keys: new Map([
				[1, "old-secret"],
				[2, "new-secret"],
			]),
			currentVersion: 2,
		};
		expect(getSecretValues(config)).toEqual(["new-secret", "old-secret"]);
	});

	it("appends legacySecret when it is not already listed", () => {
		const config: SecretConfig = {
			keys: new Map([[2, "new-secret"]]),
			currentVersion: 2,
			legacySecret: "legacy-secret",
		};
		expect(getSecretValues(config)).toEqual(["new-secret", "legacy-secret"]);
	});
});
