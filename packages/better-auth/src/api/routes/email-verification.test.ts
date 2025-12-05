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
		const { testUser, client, sessionSetter, runWithUser } =
			await getTestInstance({
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

		// Attempt to update user info (should fail before verification)
		await runWithUser(testUser.email, testUser.password, async () => {
			const updateRes = await client.updateUser({
				name: "New Name",
				image: "https://example.com/image.jpg",
			});
			expect(updateRes.data).toBeNull();
			expect(updateRes.error!.status).toBe(401);
			expect(updateRes.error!.statusText).toBe("UNAUTHORIZED");
		});

		let sessionToken = "";
		let verifyHeaders = new Headers();
		const res = await client.verifyEmail({
			query: {
				token,
			},
			fetchOptions: {
				onSuccess(context) {
					sessionToken = context.response.headers.get("set-auth-token") || "";
					sessionSetter(verifyHeaders)(context);
				},
			},
		});
		expect(sessionToken.length).toBeGreaterThan(10);
		const session = await client.getSession({
			fetchOptions: {
				headers: verifyHeaders,
				throw: true,
			},
		});
		expect(session!.user.emailVerified).toBe(true);
	});

	it("should use custom expiresIn", async () => {
		const { auth, client } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user, url, token: _token }) {
					token = _token;
					mockSendEmail(user.email, url);
				},
				expiresIn: 10,
			},
		});
		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
			},
		});
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(10 * 1000);
		const res = await client.verifyEmail({
			query: {
				token,
			},
		});
		expect(res.error?.code).toBe("TOKEN_EXPIRED");
	});

	it("should call onEmailVerification callback when email is verified", async () => {
		const onEmailVerificationMock = vi.fn();
		const { auth, client } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user, url, token: _token }) {
					token = _token;
					mockSendEmail(user.email, url);
				},
				onEmailVerification: onEmailVerificationMock,
			},
		});

		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
			},
		});

		const res = await client.verifyEmail({
			query: {
				token,
			},
		});

		expect(res.data?.status).toBe(true);
		expect(onEmailVerificationMock).toHaveBeenCalledWith(
			expect.objectContaining({ email: testUser.email }),
			expect.any(Object),
		);
	});

	it("should call afterEmailVerification callback when email is verified", async () => {
		const afterEmailVerificationMock = vi.fn();
		const { auth, client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user, url, token: _token }) {
					token = _token;
					mockSendEmail(user.email, url);
				},
				afterEmailVerification: afterEmailVerificationMock,
			},
		});

		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
			},
		});

		const res = await client.verifyEmail({
			query: {
				token,
			},
		});

		expect(res.data?.status).toBe(true);
		expect(afterEmailVerificationMock).toHaveBeenCalledWith(
			expect.objectContaining({ email: testUser.email, emailVerified: true }),
			expect.any(Object),
		);
	});

	it("should preserve encoded characters in callback URL", async () => {
		const testEmail = "test+user@example.com";
		const encodedEmail = encodeURIComponent(testEmail);
		const callbackURL = `/sign-in?verifiedEmail=${encodedEmail}`;

		await client.verifyEmail(
			{
				query: {
					token,
					callbackURL,
				},
			},
			{
				onError: (ctx) => {
					const location = ctx.response.headers.get("location");
					expect(location).toBe(`/sign-in?verifiedEmail=${encodedEmail}`);
					const url = new URL(location!, "http://localhost:3000");
					expect(url.searchParams.get("verifiedEmail")).toBe(testEmail);
				},
			},
		);
	});

	it("should properly encode callbackURL with query parameters when sending verification email", async () => {
		const mockSendEmailLocal = vi.fn();
		let capturedUrl = "";
		const { auth, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user, url, token: _token }) {
					capturedUrl = url;
					mockSendEmailLocal(user.email, url);
				},
			},
		});

		const callbackURL =
			"https://example.com/app?redirect=/dashboard&tab=settings";
		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
				callbackURL,
			},
		});
		expect(mockSendEmailLocal).toHaveBeenCalled();

		const emailUrl = new URL(capturedUrl);
		const callbackURLParam = emailUrl.searchParams.get("callbackURL");

		expect(callbackURLParam).toBe(callbackURL);
		expect(callbackURLParam).toContain("?redirect=/dashboard&tab=settings");
	});
});

describe("Email Verification Secondary Storage", async () => {
	let store = new Map<string, string>();
	let token: string;
	const { client, signInWithTestUser, db, auth, testUser, cookieSetter } =
		await getTestInstance({
			secondaryStorage: {
				set(key, value, ttl) {
					store.set(key, value);
				},
				get(key) {
					return store.get(key) || null;
				},
				delete(key) {
					store.delete(key);
				},
			},
			rateLimit: {
				enabled: false,
			},
			emailAndPassword: {
				enabled: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user, url, token: _token }) {
					token = _token;
				},
				autoSignInAfterVerification: true,
			},
			user: {
				changeEmail: {
					enabled: true,
					async sendChangeEmailVerification(data, request) {
						token = data.token;
					},
				},
			},
		});

	it("should verify email", async () => {
		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
			},
		});
		const headers = new Headers();
		await client.verifyEmail({
			query: {
				token,
			},
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.user.email).toBe(testUser.email);
		expect(session.data?.user.emailVerified).toBe(true);
	});

	it("should change email", async () => {
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async (headers) => {
			await auth.api.changeEmail({
				body: {
					newEmail: "new@email.com",
				},
				headers,
			});

			// 1. Verify confirmation token (sent to old email)
			const confirmationHeaders = new Headers();
			await client.verifyEmail({
				query: {
					token,
				},
				fetchOptions: {
					onSuccess: cookieSetter(confirmationHeaders),
					headers,
				},
			});

			// Check that email is NOT updated yet
			const sessionAfterConfirmation = await client.getSession({
				fetchOptions: {
					headers: confirmationHeaders,
				},
			});
			expect(sessionAfterConfirmation.data?.user.email).toBe(testUser.email);

			// 2. Verify new email token (token variable was updated by sendVerificationEmail mock)
			const verificationHeaders = new Headers();
			await client.verifyEmail({
				query: {
					token,
				},
				fetchOptions: {
					onSuccess: cookieSetter(verificationHeaders),
					headers: confirmationHeaders,
				},
			});

			const session = await client.getSession({
				fetchOptions: {
					headers: verificationHeaders,
				},
			});
			expect(session.data?.user.email).toBe("new@email.com");
			expect(session.data?.user.emailVerified).toBe(true);
		});
	});

	it("should set emailVerified on all sessions", async () => {
		const sampleUser = {
			name: "sampler",
			email: "sample@sample.com",
			password: "sample-password",
		};

		await client.signUp.email({
			name: sampleUser.name,
			email: sampleUser.email,
			password: sampleUser.password,
		});

		const secondSignInHeaders = new Headers();
		await client.signIn.email(
			{
				email: sampleUser.email,
				password: sampleUser.password,
			},
			{
				onSuccess: cookieSetter(secondSignInHeaders),
			},
		);

		await auth.api.sendVerificationEmail({
			body: {
				email: sampleUser.email,
			},
		});

		const headers = new Headers();
		await client.verifyEmail({
			query: {
				token,
			},
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		expect(session.data?.user.email).toBe(sampleUser.email);
		expect(session.data?.user.emailVerified).toBe(true);

		const secondSignInSession = await client.getSession({
			fetchOptions: {
				headers: secondSignInHeaders,
			},
		});

		expect(secondSignInSession.data?.user.email).toBe(sampleUser.email);
		expect(secondSignInSession.data?.user.emailVerified).toBe(true);
	});

	it("should set emailVerified on all sessions", async () => {
		const sampleUser = {
			name: "sampler2",
			email: "sample2@sample.com",
			password: "sample-password",
		};

		await client.signUp.email({
			name: sampleUser.name,
			email: sampleUser.email,
			password: sampleUser.password,
		});

		const secondSignInHeaders = new Headers();
		await client.signIn.email(
			{
				email: sampleUser.email,
				password: sampleUser.password,
			},
			{
				onSuccess: cookieSetter(secondSignInHeaders),
			},
		);

		await auth.api.sendVerificationEmail({
			body: {
				email: sampleUser.email,
			},
		});

		const headers = new Headers();
		await client.verifyEmail({
			query: {
				token,
			},
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		expect(session.data?.user.email).toBe(sampleUser.email);
		expect(session.data?.user.emailVerified).toBe(true);

		const secondSignInSession = await client.getSession({
			fetchOptions: {
				headers: secondSignInHeaders,
			},
		});

		expect(secondSignInSession.data?.user.email).toBe(sampleUser.email);
		expect(secondSignInSession.data?.user.emailVerified).toBe(true);
	});
});
