import type { D1Database } from "@cloudflare/workers-types";
import { describe, expectTypeOf, it } from "vitest";
import type { BetterAuthOptions } from "./init-options";

describe("BetterAuthOptions", () => {
	it("accepts a Cloudflare D1 database structurally", () => {
		function createOptions(database: D1Database) {
			return { database } satisfies BetterAuthOptions;
		}

		expectTypeOf(createOptions).returns.toMatchTypeOf<BetterAuthOptions>();
	});
});
