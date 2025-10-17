import { describe, test, expect } from "vitest";
import { getTestInstanceMemory } from "../test-utils";
import { symmetricDecode, symmetricEncode } from "./index";

describe("JWT", async () => {
	await getTestInstanceMemory();
	test("encode", async () => {
		const k = await symmetricEncode(
			{
				username: "test",
			},
			"better-auth-salt",
		);
		const v = await symmetricDecode(k);
		expect(v).toMatchObject({
			username: "test",
			exp: expect.any(Number),
			iat: expect.any(Number),
			jti: expect.any(String),
		});
	});
});
