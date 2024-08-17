import { describe, it, expect } from "bun:test";
import { getTestInstance } from "../test-utils/test-instance";
import { createAuthClient } from ".";
import { z } from "zod";

describe("client", async () => {
	const auth = await getTestInstance();
	it("should infer", async () => {
		const client = createAuthClient<typeof auth>();
	});
});
