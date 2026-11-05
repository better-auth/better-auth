import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { createAuthenticator } from "../test/webauthn";
import { passkey } from ".";

const ORIGIN = "http://localhost:3000";
const RP_ID = "localhost";

async function createInstance(userVerification: "required" | "preferred") {
	const { auth, client, cookieSetter, signInWithTestUser } =
		await getTestInstance({
			baseURL: ORIGIN,
			plugins: [
				passkey({
					authenticatorSelection: {
						userVerification,
					},
				}),
			],
		});
	const { headers, user } = await signInWithTestUser();
	headers.set("origin", ORIGIN);
	const authenticator = await createAuthenticator(RP_ID);

	const register = async (userVerified: boolean) => {
		const options = await client.$fetch<{ challenge: string }>(
			"/passkey/generate-register-options",
			{
				method: "GET",
				headers,
				onResponse: cookieSetter(headers),
			},
		);
		const result = await client.$fetch("/passkey/verify-registration", {
			method: "POST",
			headers,
			body: {
				response: authenticator.register(options.data!.challenge, {
					origin: ORIGIN,
					userVerified,
				}),
			},
		});
		return result.error?.status ?? 200;
	};

	const authenticate = async (userVerified: boolean) => {
		const browser = new Headers({ origin: ORIGIN });
		const authOptions = await client.$fetch<{
			challenge: string;
			userVerification: string;
		}>("/passkey/generate-authenticate-options", {
			method: "GET",
			headers: browser,
			onResponse: cookieSetter(browser),
		});
		const result = await client.$fetch("/passkey/verify-authentication", {
			method: "POST",
			headers: browser,
			body: {
				response: await authenticator.assert(authOptions.data!.challenge, {
					origin: ORIGIN,
					userVerified,
				}),
			},
			onSuccess: cookieSetter(browser),
		});
		const session = await auth.api.getSession({ headers: browser });
		return {
			requested: authOptions.data!.userVerification,
			status: result.error?.status ?? 200,
			sessionUser: session?.user.id ?? null,
		};
	};

	return { register, authenticate, user };
}

// Registration is user-verified, so only the assertion's UV flag differs.
async function setup(userVerification: "required" | "preferred") {
	const instance = await createInstance(userVerification);
	expect(await instance.register(true)).toBe(200);
	return instance;
}

/**
 * A `required` policy is requested in the authentication options and an
 * assertion whose signed authenticator data lacks the UV flag is rejected.
 *
 * @see https://www.w3.org/TR/webauthn-3/#sctn-verifying-assertion
 */
describe("passkey user verification with a real authenticator", () => {
	it("rejects an assertion without user verification when the policy is required", async () => {
		const { authenticate } = await setup("required");

		const result = await authenticate(false);

		expect(result.requested).toBe("required");
		expect(result.status).toBe(400);
		expect(result.sessionUser).toBeNull();
	});

	it("rejects a registration without user verification as a client error when the policy is required", async () => {
		const { register } = await createInstance("required");

		expect(await register(false)).toBe(400);
	});

	it("signs in with a user-verified assertion when the policy is required", async () => {
		const { authenticate, user } = await setup("required");

		const result = await authenticate(true);

		expect(result.status).toBe(200);
		expect(result.sessionUser).toBe(user.id);
	});

	it("accepts an assertion without user verification under the preferred policy", async () => {
		const { authenticate, user } = await setup("preferred");

		const result = await authenticate(false);

		expect(result.requested).toBe("preferred");
		expect(result.status).toBe(200);
		expect(result.sessionUser).toBe(user.id);
	});
});
