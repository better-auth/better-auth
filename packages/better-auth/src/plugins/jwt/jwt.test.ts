import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthClient } from "../../client";
import { jwtClient } from "./client";
import { jwt } from "./index";
import { importJWK, jwtVerify } from "jose";

describe("jwt", async (it) => {
	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [jwt()],
		logger: {
			verboseLogging: true,
		},
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [jwtClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	it("Get a token", async () => {
		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		expect(token.data?.token).toBeDefined();
	});

	it("Get JWKS", async () => {
		// If no JWK exists, this makes sure it gets added.
		// TODO: Replace this with a generate JWKS endpoint once it exists.
		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		expect(token.data?.token).toBeDefined();

		const jwks = await client.jwks();

		expect(jwks.data?.keys).length.above(0);
	});

	it("Signed tokens can be validated with the JWKS", async () => {
		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		const jwks = await client.jwks();

		const publicWebKey = await importJWK(jwks.data?.keys[0]);

		const decoded = await jwtVerify(token.data?.token!, publicWebKey);

		expect(decoded).toBeDefined();
	});
});
