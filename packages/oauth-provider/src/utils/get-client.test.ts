import type { GenericEndpointContext } from "@better-auth/core";
import { describe, expect, it, vi } from "vitest";

import { getClient } from "./index";

describe("getClient", () => {
	it("treats a client ID containing a NUL character as unknown without querying the database", async () => {
		// Postgres rejects U+0000 in text values (error 22021), so the lookup would throw.
		const findOne = vi.fn(async () => {
			throw new Error('invalid byte sequence for encoding "UTF8": 0x00');
		});
		const ctx = {
			context: { adapter: { findOne } },
		} as unknown as GenericEndpointContext;

		await expect(
			getClient(
				ctx,
				{ loginPage: "/login", consentPage: "/consent" },
				"a\u0000b",
			),
		).resolves.toBeNull();
		expect(findOne).not.toHaveBeenCalled();
	});
});
