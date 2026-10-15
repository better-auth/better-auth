import { UnsecuredJWT } from "jose";
import { assertType, expect, it } from "vitest";
import type { PaybinProfile } from "./paybin";
import { paybin } from "./paybin";

/**
 * @see https://developers.paybin.io/knowledge-center/oidc#available-scopes
 */
it("accepts Paybin identity claims without the email scope", async () => {
	const profile = { sub: "paybin-user" };
	assertType<PaybinProfile>(profile);
	const provider = paybin({
		clientId: "paybin-app",
		disableDefaultScope: true,
		scope: ["openid"],
	});

	const result = await provider.getUserInfo({
		idToken: new UnsecuredJWT(profile).encode(),
	});

	expect(result?.data).toMatchObject(profile);
	expect(result?.user.email).toBeUndefined();
	expect(result?.user.emailVerified).toBe(false);
});
