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
			name: "Onetime",
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
			client.enroll.callback({
				token,
				password: "racer-password-1234",
				name: "Racer",
			}),
			client.enroll.callback({
				token,
				password: "racer-password-1234",
				name: "Racer",
			}),
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

	/**
	 * A name is required to complete self-service enrollment -- the same
	 * guarantee signUpEmail already gives -- but the requirement is
	 * checked once, at the end of the flow, against whatever name the
	 * user ends up with. It doesn't matter which of the two steps
	 * supplied it, or whether the user was ever asked for it in a
	 * request that also needed a name for a different reason (e.g. an
	 * organization invitation, which never requires one at all -- see
	 * crud-invites.test.ts).
	 */
	describe("name requirement for self-service enrollment", () => {
		it("rejects completion when no name was ever given", async () => {
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
			await client.enroll({ email: "no-name-anywhere@example.com" });
			const res = await client.enroll.callback({
				token,
				password: "no-name-password-123",
			});
			expect(res.error?.status).toBe(400);
			expect(res.error?.code).toBe("NAME_REQUIRED");
		});

		it("accepts a name given only at /enroll (initiation)", async () => {
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
			await client.enroll({
				email: "named-at-start@example.com",
				name: "Given At Start",
			});
			const res = await client.enroll.callback({
				token,
				password: "named-at-start-password-123",
			});
			expect(res.data?.user.name).toBe("Given At Start");
		});

		it("accepts a name given only at /enroll/callback (completion)", async () => {
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
			await client.enroll({ email: "named-at-end@example.com" });
			const res = await client.enroll.callback({
				token,
				password: "named-at-end-password-123",
				name: "Given At End",
			});
			expect(res.data?.user.name).toBe("Given At End");
		});
	});

	/**
	 * Found in automated PR review (both cubic and Greptile flagged the
	 * same root cause independently): the token was consumed and
	 * revokeUnprovenAccountAccess had already stripped the row's prior
	 * access before the name requirement was checked. A caller who
	 * omitted the name lost the token and any prior credential with no
	 * way back, since a fresh /enroll for the now-verified email issues
	 * no new token at all (anti-enumeration). Name and password are now
	 * fully validated against a peeked (non-consumed) token before
	 * anything destructive happens.
	 */
	describe("a failed completion never strands the account", () => {
		it("rejecting a missing name leaves the token's row untouched, retryable via a fresh /enroll", async () => {
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
			await client.enroll({ email: "recoverable@example.com" });
			const firstToken = token;

			const blocked = await client.enroll.callback({
				token: firstToken,
				password: "recoverable-password-123",
			});
			expect(blocked.error?.code).toBe("NAME_REQUIRED");

			const users = await db.findMany({
				model: "user",
				where: [{ field: "email", value: "recoverable@example.com" }],
			});
			const user = users[0] as { emailVerified: boolean; id: string };
			expect(user.emailVerified).toBe(false);
			const accounts = await db.findMany({
				model: "account",
				where: [{ field: "userId", value: user.id }],
			});
			expect(accounts).toHaveLength(0);

			// A fresh /enroll call for the same (still unverified) email
			// issues a new token, since the row was never touched.
			await client.enroll({ email: "recoverable@example.com" });
			expect(token).not.toBe(firstToken);

			const completed = await client.enroll.callback({
				token,
				password: "recoverable-password-123",
				name: "Recovered",
			});
			expect(completed.data?.user.email).toBe("recoverable@example.com");
		});

		it("the original token still works after a failed completion, once retried with a name", async () => {
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
			await client.enroll({ email: "same-token-retry@example.com" });

			const blocked = await client.enroll.callback({
				token,
				password: "same-token-retry-password-123",
			});
			expect(blocked.error?.code).toBe("NAME_REQUIRED");

			// Nothing was consumed: the *same* token, with a name added,
			// completes normally.
			const completed = await client.enroll.callback({
				token,
				password: "same-token-retry-password-123",
				name: "Retried",
			});
			expect(completed.data?.user.name).toBe("Retried");
		});
	});

	/**
	 * Found in automated PR review: `callbackURL` was accepted and
	 * origin-checked but never used -- the emailed `url` always pointed
	 * at `/enroll/callback`, a POST-only endpoint that can never be the
	 * target of a clicked link.
	 */
	it("embeds callbackURL, resolved against baseURL's origin, in the emailed url", async () => {
		let capturedUrl = "";
		const { client } = await getTestInstance({
			baseURL: "http://localhost:3000/api/auth",
			user: {
				enrollment: {
					enabled: true,
					async sendEnrollmentVerification(data) {
						capturedUrl = data.url;
					},
				},
			},
		});
		await client.enroll({
			email: "callback-url@example.com",
			callbackURL: "/finish-enrollment",
		});
		expect(capturedUrl).toMatch(
			/^http:\/\/localhost:3000\/finish-enrollment\?token=/,
		);
	});

	/**
	 * Found in a follow-up review (Greptile) on the callbackURL fix
	 * above: naively appending "?token=..." produces a second "?"
	 * instead of "&" when callbackURL already carries its own query
	 * string, yielding a malformed URL the app's router can't parse.
	 */
	it("appends the token with & when callbackURL already has a query string", async () => {
		let capturedUrl = "";
		const { client } = await getTestInstance({
			baseURL: "http://localhost:3000/api/auth",
			user: {
				enrollment: {
					enabled: true,
					async sendEnrollmentVerification(data) {
						capturedUrl = data.url;
					},
				},
			},
		});
		await client.enroll({
			email: "callback-url-with-query@example.com",
			callbackURL: "/finish-enrollment?ref=email",
		});
		const parsed = new URL(capturedUrl);
		expect(parsed.pathname).toBe("/finish-enrollment");
		expect(parsed.searchParams.get("ref")).toBe("email");
		expect(parsed.searchParams.get("token")).not.toBeNull();
		expect(capturedUrl).not.toContain("??");
		expect((capturedUrl.match(/\?/g) ?? []).length).toBe(1);
	});

	/**
	 * A follow-up finding (Greptile) on an earlier fix attempt: applying
	 * `ctx.body.name` to a *reclaimed* existing row at /enroll -- meant
	 * to fix a real complaint (a real owner ends up with a pre-squatter's
	 * name unless they also pass one at /enroll/callback) -- introduced
	 * a worse problem: /enroll has no proof of ownership at all (it's the
	 * anti-enumeration-gated initiation step, callable by anyone for any
	 * email), so it let an unauthenticated caller rename someone else's
	 * pending user before that person had so much as received the
	 * email. Reverted: /enroll never touches an existing row's name.
	 * The real owner can still set their name safely once they actually
	 * prove ownership, at /enroll/callback.
	 */
	it("does not let an unauthenticated /enroll call rename an existing unverified user", async () => {
		const { client } = await getTestInstance({
			user: {
				enrollment: {
					enabled: true,
					sendEnrollmentVerification: async () => {},
				},
			},
		});
		await client.signUp.email({
			email: "no-unproven-rename@example.com",
			password: "original-password-123",
			name: "Original Name",
		});

		await client.enroll({
			email: "no-unproven-rename@example.com",
			name: "Attacker Chosen Name",
		});

		const signIn = await client.signIn.email({
			email: "no-unproven-rename@example.com",
			password: "original-password-123",
		});
		expect(signIn.data?.user.name).toBe("Original Name");
	});
});
