import { makeSignature } from "better-auth/crypto";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { oauthProvider } from "./oauth";
import { canonicalizeOAuthQueryParams } from "./signed-query";

/**
 * An expired signed query must be distinguishable from a tampered one so that
 * login UIs can ask the user to restart instead of showing "invalid link".
 */
describe("signed oauth_query rejection codes", () => {
	async function setup() {
		const { client, auth, testUser } = await getTestInstance({
			plugins: [
				jwt(),
				oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
			],
		});
		const secret = (await auth.$context).secret;
		const sign = async (exp: number) => {
			const params = new URLSearchParams({ client_id: "synthetic" });
			params.set("exp", String(exp));
			params.set(
				"sig",
				await makeSignature(
					canonicalizeOAuthQueryParams(params).toString(),
					secret,
				),
			);
			return params;
		};
		const signIn = (oauth_query: string) =>
			client.signIn.email({
				email: testUser.email,
				password: testUser.password,
				// oauth_query is read from the raw request body by the before-hook
				...({ oauth_query } as Record<string, string>),
			});
		return { sign, signIn };
	}

	it("returns expired_request for a validly signed but expired query", async () => {
		const { sign, signIn } = await setup();
		const res = await signIn((await sign(1)).toString());
		expect(res.error?.status).toBe(400);
		expect(res.error).toMatchObject({ error: "expired_request" });
	});

	it("returns invalid_signature for a tampered query", async () => {
		const { sign, signIn } = await setup();
		const tampered = await sign(Math.floor(Date.now() / 1000) + 600);
		tampered.set("client_id", "changed");
		const res = await signIn(tampered.toString());
		expect(res.error?.status).toBe(400);
		expect(res.error).toMatchObject({ error: "invalid_signature" });
	});

	it("returns invalid_signature for an expired query with a bad signature", async () => {
		const { sign, signIn } = await setup();
		const forged = await sign(Math.floor(Date.now() / 1000) + 600);
		forged.set("exp", "1");
		const res = await signIn(forged.toString());
		expect(res.error).toMatchObject({ error: "invalid_signature" });
	});
});
