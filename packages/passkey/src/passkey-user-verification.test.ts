import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { createAuthenticator } from "../test/webauthn";
import type { PasskeyOptions } from ".";
import { passkey } from ".";

const ORIGIN = "http://localhost:3000";

async function setup(
	userVerification?: NonNullable<
		PasskeyOptions["authenticatorSelection"]
	>["userVerification"],
) {
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
	const authenticator = await createAuthenticator("localhost");

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
		const options = await client.$fetch<{
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
				response: await authenticator.assert(options.data!.challenge, {
					origin: ORIGIN,
					userVerified,
				}),
			},
			onSuccess: cookieSetter(browser),
		});
		const session = await auth.api.getSession({ headers: browser });
		return {
			requested: options.data!.userVerification,
			status: result.error?.status ?? 200,
			sessionUser: session?.user.id ?? null,
		};
	};

	return { register, authenticate, user };
}

/**
 * Runs both ceremonies through the real WebAuthn verifier with a software
 * authenticator, so the user verification flag is signed, not mocked.
 *
 * @see https://www.w3.org/TR/webauthn-3/#sctn-verifying-assertion
 */
describe("passkey user verification policy", () => {
	it("requests and enforces user verification at authentication when required", async () => {
		const { register, authenticate } = await setup("required");
		expect(await register(true)).toBe(200);

		const result = await authenticate(false);

		expect(result.requested).toBe("required");
		expect(result.status).toBe(400);
		expect(result.sessionUser).toBeNull();
	});

	it("rejects a registration without user verification as a client error when required", async () => {
		const { register } = await setup("required");

		expect(await register(false)).toBe(400);
	});

	it("control: accepts a verified assertion when required", async () => {
		const { register, authenticate, user } = await setup("required");
		expect(await register(true)).toBe(200);

		const result = await authenticate(true);

		expect(result.status).toBe(200);
		expect(result.sessionUser).toBe(user.id);
	});

	it("control: keeps user verification optional under the default policy", async () => {
		const { register, authenticate, user } = await setup();
		expect(await register(false)).toBe(200);

		const result = await authenticate(false);

		expect(result.requested).toBe("preferred");
		expect(result.status).toBe(200);
		expect(result.sessionUser).toBe(user.id);
	});
});
