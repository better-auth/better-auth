import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { electron } from "../src/index";

/**
 * @see https://better-auth.com/docs/concepts/database#database-hooks
 */
describe("electron transfer vetoed by a verification hook", () => {
	it("does not return an authorization code that was not stored", async () => {
		const veto = { active: false };
		const { auth, signInWithTestUser } = await getTestInstance({
			databaseHooks: {
				verification: {
					create: {
						async before() {
							return veto.active ? false : undefined;
						},
					},
				},
			},
			plugins: [electron()],
		});
		const { headers } = await signInWithTestUser();
		headers.set("content-type", "application/json");
		veto.active = true;

		const res = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/electron/transfer-user?client_id=electron&state=xyz&code_challenge=challenge",
				{ method: "POST", headers, body: JSON.stringify({}) },
			),
		);

		expect(res.status).toBe(500);
		expect((await res.json()).code).toBe("FAILED_TO_CREATE_VERIFICATION");
		expect(res.headers.get("set-cookie") ?? "").not.toContain(
			"better-auth.electron=",
		);
	});
});
