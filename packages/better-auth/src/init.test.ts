import { describe, expect, it } from "vitest";
import { init } from "./init";
import { createAuthClient } from "./client";

describe("init", async () => {
	const client = createAuthClient();

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
