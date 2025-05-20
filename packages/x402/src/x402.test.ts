import { betterAuth } from "better-auth";
import { describe, it } from "vitest";
import { x402 } from ".";
import { createAuthClient } from "better-auth/client";
import { bearer } from "better-auth/plugins";
import { x402Client } from "./client";
import { setCookieToHeader } from "better-auth/cookies";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { baseSepolia } from "viem/chains";


const TEST_WALLET = "0x0000000000000000000000000000000000000000";
const TEST_PRIVATE_KEY = "0x0000000000000000000000000000000000000000";

const auth = betterAuth({
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		x402(
			{
				"/api/auth/get-session": {
					price: "$0.001",
					protect: true,
				},
				"/api/auth/sign-up": {
					price: "$0.001",
				},
			},
			{
				wallet: TEST_WALLET,
				facilitatorURL: "https://x402.org/facilitator",
				isUnitTest: true,
			},
		),
	],
});

// Create a wallet client
const account = privateKeyToAccount(TEST_PRIVATE_KEY);
const client = createWalletClient({
	account,
	transport: http(),
	chain: baseSepolia,
});

const authClient = createAuthClient({
	baseURL: "http://localhost:3000",
	plugins: [
		bearer(),
		x402Client({
			walletClient: client,
			isUnitTest: {
				async customFetch(request) {
					return await auth.handler(request)
				},
			},
		}),
	],
	fetchOptions: {
		customFetchImpl: async (url, init) => {
			return auth.handler(new Request(url, init));
		},
	},
});

const testUser = {
	email: "test@test.com",
	password: "password",
	name: "Test User",
};

// Sign up the test user
await auth.api.signUpEmail({ body: testUser });

const headers = new Headers();
const userRes = await authClient.signIn.email(testUser, {
	throw: true,
	onSuccess: setCookieToHeader(headers),
});

describe("x402", async () => {
	it("Should hit a normal endpoint without paywall requirements", async () => {
		const res = await authClient.$fetch<{ ok: true }>("/ok");
		expect(res.data?.ok).toBe(true);
	});

	it("Should be required to be authenticated to access a protected endpoint", async () => {
		const res = await authClient.getSession();
		expect(res.error?.statusText).toBe("UNAUTHORIZED");
	});

	it("Should be required to pay to access a paywalled endpoint", async () => {
		const res = await authClient.getSession({ fetchOptions: { headers } });
		console.log("RES:", res);
		expect(res.error?.statusText).toBe("PAYMENT_REQUIRED");
	});
});
