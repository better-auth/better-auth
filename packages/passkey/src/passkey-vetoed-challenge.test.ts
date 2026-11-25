import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { passkey } from ".";

/**
 * @see https://better-auth.com/docs/concepts/database#database-hooks
 */
describe("passkey challenges vetoed by a verification hook", () => {
	async function setup() {
		const veto = { active: false };
		const { auth, signInWithTestUser } = await getTestInstance({
			baseURL: "http://localhost:3000",
			databaseHooks: {
				verification: {
					create: {
						async before() {
							return veto.active ? false : undefined;
						},
					},
				},
			},
			plugins: [passkey()],
		});
		const { headers } = await signInWithTestUser();
		veto.active = true;
		return { auth, headers };
	}

	it("does not return registration options whose challenge was not stored", async () => {
		const { auth, headers } = await setup();

		const res = await auth.api.generatePasskeyRegistrationOptions({
			headers,
			asResponse: true,
		});

		expect(res.status).toBe(500);
		expect((await res.json()).code).toBe("FAILED_TO_CREATE_VERIFICATION");
		expect(res.headers.get("set-cookie") ?? "").not.toContain(
			"better-auth-passkey=",
		);
	});

	it("does not return authentication options whose challenge was not stored", async () => {
		const { auth } = await setup();

		const res = await auth.api.generatePasskeyAuthenticationOptions({
			headers: new Headers(),
			asResponse: true,
		});

		expect(res.status).toBe(500);
		expect((await res.json()).code).toBe("FAILED_TO_CREATE_VERIFICATION");
		expect(res.headers.get("set-cookie") ?? "").not.toContain(
			"better-auth-passkey=",
		);
	});
});
