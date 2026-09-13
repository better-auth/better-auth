import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("enroll", async () => {
	it("should respond not found for /enroll and /enroll/callback when enrollment is disabled", async () => {
		const { client } = await getTestInstance({
			user: { enrollment: { enabled: false } },
		});
		const res = await client.enroll({ email: "new-user@example.com" });
		expect(res.error?.status).toBe(404);
		const callbackRes = await client.enroll.callback({
			token: "irrelevant",
			password: "password1234",
		});
		expect(callbackRes.error?.status).toBe(404);
	});

	it("should create a pending user and send the enrollment email for a new email", async () => {
		let sent: { user: { email: string }; token: string } | undefined;
		const { client, db } = await getTestInstance({
			user: {
				enrollment: {
					enabled: true,
					async sendEnrollmentVerification(data) {
						sent = data;
					},
				},
			},
		});
		const res = await client.enroll({ email: "invitee@example.com" });
		expect(res.data).toMatchObject({ status: true });
		expect(sent?.user.email).toBe("invitee@example.com");
		expect(sent?.token.length).toBe(32);

		const users = await db.findMany({
			model: "user",
			where: [{ field: "email", value: "invitee@example.com" }],
		});
		expect(users).toHaveLength(1);
		expect((users[0] as { emailVerified: boolean }).emailVerified).toBe(
			false,
		);
	});

	it("should behave generically and send no email for an existing verified user (anti-enumeration)", async () => {
		const sendEnrollmentVerification = vi.fn();
		const { client, testUser, db } = await getTestInstance({
			user: {
				enrollment: {
					enabled: true,
					sendEnrollmentVerification,
				},
			},
		});
		// The test user sign-up.email created is unverified by default; flip
		// it to verified so this test exercises the anti-enumeration branch
		// rather than the unverified-reclaim branch covered separately below.
		await db.update({
			model: "user",
			where: [{ field: "email", value: testUser.email }],
			update: { emailVerified: true },
		});

		const res = await client.enroll({ email: testUser.email });
		expect(res.data).toMatchObject({ status: true });
		expect(sendEnrollmentVerification).not.toHaveBeenCalled();
	});

	it("should still send an enrollment email for an existing but unverified user, letting the real owner reclaim a pre-squatted email", async () => {
		let token = "";
		const { client } = await getTestInstance({
			user: {
				enrollment: {
					enabled: true,
					async sendEnrollmentVerification(data) {
						token = data.token;
					},
				},
			},
		});
		// Unverified because sign-up always creates the row with
		// emailVerified: false regardless of requireEmailVerification.
		await client.signUp.email({
			email: "squatted@example.com",
			password: "attacker-password-1234",
			name: "attacker",
		});

		const res = await client.enroll({ email: "squatted@example.com" });
		expect(res.data).toMatchObject({ status: true });
		expect(token.length).toBe(32);
	});

	it("should complete enrollment: consume the token, set a password, verify the email, and sign in", async () => {
		let token = "";
		const { client, db } = await getTestInstance({
			user: {
				enrollment: {
					enabled: true,
					async sendEnrollmentVerification(data) {
						token = data.token;
					},
				},
			},
		});
		await client.enroll({ email: "enrollee@example.com" });
		expect(token.length).toBe(32);

		const res = await client.enroll.callback({
			token,
			password: "enrollee-password-1234",
			name: "Enrollee",
		});
		expect(res.data?.token).toBeDefined();
		expect(res.data?.user.email).toBe("enrollee@example.com");
		expect(res.data?.user.emailVerified).toBe(true);
		expect(res.data?.user.name).toBe("Enrollee");

		const accounts = await db.findMany({
			model: "account",
			where: [{ field: "userId", value: res.data!.user.id }],
		});
		expect(accounts).toHaveLength(1);
		expect((accounts[0] as { providerId: string }).providerId).toBe(
			"credential",
		);
	});

	it("should reject an invalid or already-consumed token", async () => {
		let token = "";
		const { client } = await getTestInstance({
			user: {
				enrollment: {
					enabled: true,
					async sendEnrollmentVerification(data) {
						token = data.token;
					},
				},
			},
		});
		await client.enroll({ email: "onetime@example.com" });
		const first = await client.enroll.callback({
			token,
			password: "onetime-password-1234",
		});
		expect(first.data?.token).toBeDefined();

		const replay = await client.enroll.callback({
			token,
			password: "onetime-password-1234",
		});
		expect(replay.error?.status).toBe(400);
	});

	it("should reject a password shorter than the configured minimum", async () => {
		let token = "";
		const { client } = await getTestInstance({
			user: {
				enrollment: {
					enabled: true,
					async sendEnrollmentVerification(data) {
						token = data.token;
					},
				},
			},
		});
		await client.enroll({ email: "shortpass@example.com" });
		const res = await client.enroll.callback({
			token,
			password: "short",
		});
		expect(res.error?.status).toBe(400);
	});

	it("should reject a password longer than the configured maximum", async () => {
		let token = "";
		const { client } = await getTestInstance({
			user: {
				enrollment: {
					enabled: true,
					async sendEnrollmentVerification(data) {
						token = data.token;
					},
				},
			},
		});
		await client.enroll({ email: "longpass@example.com" });
		const res = await client.enroll.callback({
			token,
			// Default emailAndPassword.maxPasswordLength is 128.
			password: "a".repeat(129),
		});
		expect(res.error?.status).toBe(400);
	});

	it("should reject a naturally expired token", async () => {
		let token = "";
		const { client, db } = await getTestInstance({
			user: {
				enrollment: {
					enabled: true,
					async sendEnrollmentVerification(data) {
						token = data.token;
					},
				},
			},
		});
		await client.enroll({ email: "expired@example.com" });
		await db.update({
			model: "verification",
			where: [{ field: "identifier", value: `enroll:${token}` }],
			update: { expiresAt: new Date(Date.now() - 1000) },
		});

		const res = await client.enroll.callback({
			token,
			password: "expired-password-1234",
		});
		expect(res.error?.status).toBe(400);
	});

	/**
	 * Reuses the same guarantee magic-link/email-otp already give their own
	 * passwordless sign-ins: an emailVerified:false row that accrued a
	 * credential account and sessions before its mailbox was proven has
	 * that access stripped once the real owner completes enrollment.
	 * @see https://github.com/better-auth/better-auth/pull/10239
	 */
	it("should strip a pre-existing unverified account and sessions before completing enrollment", async () => {
		let token = "";
		const { client, db } = await getTestInstance({
			user: {
				enrollment: {
					enabled: true,
					async sendEnrollmentVerification(data) {
						token = data.token;
					},
				},
			},
		});
		const signUpRes = await client.signUp.email({
			email: "reclaimed@example.com",
			password: "attacker-password-1234",
			name: "attacker",
		});
		const attackerUserId = signUpRes.data!.user.id;

		await client.enroll({ email: "reclaimed@example.com" });
		const res = await client.enroll.callback({
			token,
			password: "owner-password-1234",
		});
		expect(res.data?.user.id).toBe(attackerUserId);

		const accounts = await db.findMany({
			model: "account",
			where: [{ field: "userId", value: attackerUserId }],
		});
		expect(accounts).toHaveLength(1);

		// The attacker's original password must no longer work.
		const attackerSignIn = await client.signIn.email({
			email: "reclaimed@example.com",
			password: "attacker-password-1234",
		});
		expect(attackerSignIn.error).toBeDefined();
	});

	it("should only complete once when the same token is used concurrently", async () => {
		let token = "";
		const { client } = await getTestInstance({
			user: {
				enrollment: {
					enabled: true,
					async sendEnrollmentVerification(data) {
						token = data.token;
					},
				},
			},
		});
		await client.enroll({ email: "racer@example.com" });

		const [first, second] = await Promise.all([
			client.enroll.callback({ token, password: "racer-password-1234" }),
			client.enroll.callback({ token, password: "racer-password-1234" }),
		]);
		const successes = [first, second].filter((r) => r.data);
		const failures = [first, second].filter((r) => r.error);
		expect(successes).toHaveLength(1);
		expect(failures).toHaveLength(1);
	});

	it("rejects a stale token whose row was already verified through a different path", async () => {
		let token = "";
		const { client, db } = await getTestInstance({
			user: {
				enrollment: {
					enabled: true,
					async sendEnrollmentVerification(data) {
						token = data.token;
					},
				},
			},
		});
		await client.enroll({ email: "verified-elsewhere@example.com" });
		expect(token.length).toBe(32);

		// Simulate the row being verified through an unrelated path (e.g. an
		// OAuth sign-in landing on the same email) between the enrollment
		// email being sent and the callback being completed.
		await db.update({
			model: "user",
			where: [{ field: "email", value: "verified-elsewhere@example.com" }],
			update: { emailVerified: true },
		});

		const res = await client.enroll.callback({
			token,
			password: "irrelevant-password-123",
		});
		expect(res.error?.status).toBe(400);
	});

	/**
	 * Found in an independent re-review: `enrollment.enabled` without
	 * `sendEnrollmentVerification` is valid at the type level, and the
	 * handler used to only check `enabled` -- letting it create a pending
	 * user, then fail creating the token with a 400. A verified existing
	 * email still got the generic 200, so the response code alone leaked
	 * whether the email had an account: a real anti-enumeration break.
	 */
	it("responds not found -- uniformly, for every email -- when enrollment is enabled but misconfigured", async () => {
		const { client, testUser, db } = await getTestInstance({
			user: { enrollment: { enabled: true } },
		});
		await db.update({
			model: "user",
			where: [{ field: "email", value: testUser.email }],
			update: { emailVerified: true },
		});

		const forVerified = await client.enroll({ email: testUser.email });
		const forNew = await client.enroll({ email: "half-configured@example.com" });

		expect(forVerified.error?.status).toBe(404);
		expect(forNew.error?.status).toBe(404);

		const users = await db.findMany({
			model: "user",
			where: [{ field: "email", value: "half-configured@example.com" }],
		});
		expect(users).toHaveLength(0);
	});
});
