import { describe, expect, it } from "vitest";
import { createAuthClient } from "./client";
import { init } from "./init";
import { getTestInstance } from "./test-utils/test-instance";

describe("init", async () => {
	const { client } = await getTestInstance();

	it("should match config", () => {
		const res = init({
			database: {
				provider: "sqlite",
				url: ":memory:",
			},
		});
		expect(res).toMatchSnapshot();
	});

	it("should respond ok endpoint", async () => {
		const res = await client.$fetch<{ ok: boolean }>("/ok");
		expect(res.data?.ok).toBe(true);
	});
});
