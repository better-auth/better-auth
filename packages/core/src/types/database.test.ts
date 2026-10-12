import type { D1Database as CloudflareD1Database } from "@cloudflare/workers-types";
import { describe, expectTypeOf, it } from "vitest";
import type { D1Database } from "./database";

describe("D1Database", () => {
	it("accepts Cloudflare's D1 database type", () => {
		expectTypeOf<CloudflareD1Database>().toExtend<D1Database>();
	});
});
