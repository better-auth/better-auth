import { describe, test, expect } from "vitest";
import { getTestInstanceMemory } from "../test-utils";
import { symmetricDecode, symmetricEncode } from "./index";
import { runWithEndpointContext } from "@better-auth/core/context";

describe("JWT", async () => {
	const { auth } = await getTestInstanceMemory();
	test("encode", async () => {
		await runWithEndpointContext({ context: await auth.$context }, async () => {
			const k = await symmetricEncode(
				{
					username: "test",
				},
				"better-auth-salt",
			);
			const v = await symmetricDecode(k, "better-auth-salt");
			expect(v).toMatchObject({
				username: "test",
				exp: expect.any(Number),
				iat: expect.any(Number),
				jti: expect.any(String),
			});
		});
	});
});
