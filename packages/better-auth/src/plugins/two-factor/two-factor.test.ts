import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { twoFactor, twoFactorClient } from ".";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../utils/cookies";
import type { User } from "../../adapters/schema";
import type { UserWithTwoFactor } from "./types";

describe("two factor", async () => {
	const { auth, testUser, customFetchImpl, sessionSetter, db } =
		await getTestInstance({
			plugins: [twoFactor()],
		});

	const headers = new Headers();
	it("should enable two factor", async () => {
		const client = createAuthClient({
			plugins: [twoFactorClient()],
			fetchOptions: {
				customFetchImpl,
				baseURL: "http://localhost:3000/api/auth",
			},
		});
		const session = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			options: {
				onSuccess: sessionSetter(headers),
			},
		});
		if (!session) {
			throw new Error("No session");
		}
		const res = await client.twoFactor.enable({
			options: {
				headers,
			},
		});
		expect(res.data?.status).toBe(true);
		const dbUser = await db.findOne<UserWithTwoFactor>({
			model: "user",
			where: [
				{
					field: "id",
					value: session.data?.user.id as string,
				},
			],
		});
		expect(dbUser?.twoFactorEnabled).toBe(true);
	});
});
