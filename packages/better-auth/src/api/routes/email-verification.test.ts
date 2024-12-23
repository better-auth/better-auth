import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("Email Verification", async () => {
	const mockSendEmail = vi.fn();
	let token: string;
	const { auth, testUser, client, signInWithUser } = await getTestInstance({
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
		},
		emailVerification: {
			async sendVerificationEmail({ user, url, token: _token }) {
				token = _token;
				mockSendEmail(user.email, url);
			},
		},
	});

	it("should send a verification email when enabled", async () => {
		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
			},
		});
		expect(mockSendEmail).toHaveBeenCalledWith(
			testUser.email,
			expect.any(String),
		);
	});

	it("should send a verification email if verification is required and user is not verified", async () => {
		await signInWithUser(testUser.email, testUser.password);

		expect(mockSendEmail).toHaveBeenCalledWith(
			testUser.email,
			expect.any(String),
		);
	});

	it("should verify email", async () => {
		const res = await client.verifyEmail({
			query: {
				token,
			},
		});
		expect(res.data?.status).toBe(true);
	});

	it("should redirect to callback", async () => {
		await client.verifyEmail(
			{
				query: {
					token,
					callbackURL: "/callback",
				},
			},
			{
				onError: (ctx) => {
					const location = ctx.response.headers.get("location");
					expect(location).toBe("/callback");
				},
			},
		);
	});

	it("should sign after verification", async () => {
		const { testUser, signInWithUser, client } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user, url, token: _token }) {
					token = _token;
					mockSendEmail(user.email, url);
				},
				autoSignInAfterVerification: true,
			},
		});
		await signInWithUser(testUser.email, testUser.password);

		let sessionToken = "";
		const res = await client.verifyEmail({
			query: {
				token,
			},
			fetchOptions: {
				onSuccess(context) {
					sessionToken = context.response.headers.get("set-auth-token") || "";
				},
			},
		});
		expect(sessionToken.length).toBeGreaterThan(10);
	});
});
