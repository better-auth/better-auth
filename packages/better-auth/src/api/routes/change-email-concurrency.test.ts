import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { inferAdditionalFields } from "../../plugins/additional-fields/client";
import { getTestInstance } from "../../test-utils/test-instance";

/** @see https://github.com/better-auth/better-auth/pull/8916 */
describe("verification-table email change concurrency", () => {
	it("rejects verification when cancellation wins before the user update", async () => {
		const entered = Promise.withResolvers<void>();
		const resume = Promise.withResolvers<void>();
		let url = "";
		const completed = vi.fn();
		const { auth, client, db, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					sendVerificationEmail: async (data) => {
						url = data.url;
					},
					onChangeEmailCompleted: completed,
				},
			},
			databaseHooks: {
				user: {
					update: {
						before: async (data) => {
							if (data.email === "race@example.com") {
								entered.resolve();
								await resume.promise;
							}
						},
					},
				},
			},
		});
		const { headers, user } = await signInWithTestUser();
		await client.changeEmail({ newEmail: "race@example.com" }, { headers });
		const verification = auth.handler(new Request(url, { headers }));
		await entered.promise;
		try {
			expect(
				(await client.cancelEmailChange({}, { headers })).data?.status,
			).toBe(true);
		} finally {
			resume.resolve();
		}
		const response = await verification;
		expect(response.headers.get("location")).toContain("error=INVALID_TOKEN");
		expect(completed).not.toHaveBeenCalled();
		const stored = await db.findOne<{
			email: string;
			pendingEmail: string | null;
		}>({
			model: "user",
			where: [{ field: "id", value: user.id }],
		});
		expect(stored).toMatchObject({ email: user.email, pendingEmail: null });
	});

	it.each([
		"race@example.com",
		"newer@example.com",
	])("rejects an in-flight verification superseded by a request to %s", async (newEmail) => {
		const entered = Promise.withResolvers<void>();
		const resume = Promise.withResolvers<void>();
		const urls: string[] = [];
		const completed = vi.fn();
		let paused = false;
		const { auth, client, db, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					sendVerificationEmail: async ({ url }) => {
						urls.push(url);
					},
					onChangeEmailCompleted: completed,
				},
			},
			databaseHooks: {
				user: {
					update: {
						before: async (data) => {
							if (data.email === "race@example.com" && !paused) {
								paused = true;
								entered.resolve();
								await resume.promise;
							}
						},
					},
				},
			},
		});
		const { headers, user } = await signInWithTestUser();
		await client.changeEmail({ newEmail: "race@example.com" }, { headers });
		const first = auth.handler(new Request(urls[0]!, { headers }));
		await entered.promise;
		try {
			expect(
				(await client.changeEmail({ newEmail }, { headers })).data?.status,
			).toBe(true);
		} finally {
			resume.resolve();
		}
		expect((await first).headers.get("location")).toContain(
			"error=INVALID_TOKEN",
		);
		expect(completed).not.toHaveBeenCalled();
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: user.id }],
			}),
		).toMatchObject({ email: user.email, pendingEmail: newEmail });
		expect(
			(await auth.handler(new Request(urls[1]!, { headers }))).headers.get(
				"location",
			),
		).toBe("/");
		expect(completed).toHaveBeenCalledOnce();
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: user.id }],
			}),
		).toMatchObject({ email: newEmail, pendingEmail: null });
	});

	it.each([
		"first@example.com",
		"second@example.com",
	])("does not clear a newer request to %s when an older email send fails", async (newEmail) => {
		const entered = Promise.withResolvers<void>();
		const resume = Promise.withResolvers<void>();
		const urls: string[] = [];
		const { auth, client, db, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					sendVerificationEmail: async ({ url }) => {
						urls.push(url);
						if (urls.length === 1) {
							entered.resolve();
							await resume.promise;
							throw new Error("first delivery failed");
						}
					},
				},
			},
		});
		const { headers, user } = await signInWithTestUser();
		const first = client.changeEmail(
			{ newEmail: "first@example.com" },
			{ headers },
		);
		await entered.promise;
		try {
			expect(
				(await client.changeEmail({ newEmail }, { headers })).data?.status,
			).toBe(true);
		} finally {
			resume.resolve();
		}
		await first;
		const stored = await db.findOne<{ pendingEmail: string | null }>({
			model: "user",
			where: [{ field: "id", value: user.id }],
		});
		expect(stored?.pendingEmail).toBe(newEmail);
		const response = await auth.handler(new Request(urls[1]!, { headers }));
		expect(response.headers.get("location")).not.toContain("error=");
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: user.id }],
			}),
		).toMatchObject({ email: newEmail, pendingEmail: null });
	});

	it("does not reactivate an old link after cancellation and a new request to the same address", async () => {
		const urls: string[] = [];
		const { auth, client, db, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					sendVerificationEmail: async ({ url }) => {
						urls.push(url);
					},
				},
			},
		});
		const { headers, user } = await signInWithTestUser();
		await client.changeEmail({ newEmail: "same@example.com" }, { headers });
		await client.cancelEmailChange({}, { headers });
		await client.changeEmail({ newEmail: "same@example.com" }, { headers });
		const stale = await auth.handler(new Request(urls[0]!, { headers }));
		expect(stale.headers.get("location")).toContain("error=INVALID_TOKEN");
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: user.id }],
			}),
		).toMatchObject({ email: user.email, pendingEmail: "same@example.com" });
		const current = await auth.handler(new Request(urls[1]!, { headers }));
		expect(current.headers.get("location")).not.toContain("error=");
	});

	it("keeps verification-table confirmation mandatory for an unverified user", async () => {
		const send = vi.fn();
		const { client, db, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					updateEmailWithoutVerification: true,
					sendVerificationEmail: send,
				},
			},
		});
		const { headers, user } = await signInWithTestUser();
		await db.update({
			model: "user",
			where: [{ field: "id", value: user.id }],
			update: { emailVerified: false },
		});
		await client.changeEmail(
			{ newEmail: "unverified@example.com" },
			{ headers },
		);
		expect(send).toHaveBeenCalledOnce();
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: user.id }],
			}),
		).toMatchObject({
			email: user.email,
			pendingEmail: "unverified@example.com",
		});
	});

	it("does not create a login session when an anonymous visitor verifies an email change", async () => {
		let url = "";
		const { auth, client, db, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					sendVerificationEmail: async (data) => {
						url = data.url;
					},
				},
			},
		});
		const { headers, user } = await signInWithTestUser();
		await client.changeEmail(
			{ newEmail: "anonymous@example.com" },
			{ headers },
		);
		const sessionsBefore = await db.count({ model: "session" });
		const response = await auth.handler(new Request(url));
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe("/");
		expect(response.headers.getSetCookie()).toEqual([]);
		expect(await db.count({ model: "session" })).toBe(sessionsBefore);
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: user.id }],
			}),
		).toMatchObject({ email: "anonymous@example.com", pendingEmail: null });
	});

	it("does not replace another account's session or consume its verification link", async () => {
		let url = "";
		const { auth, client, db, signInWithTestUser, sessionSetter } =
			await getTestInstance({
				user: {
					changeEmail: {
						enabled: true,
						strategy: "verification-table",
						sendVerificationEmail: async (data) => {
							url = data.url;
						},
					},
				},
			});
		const { headers, user } = await signInWithTestUser();
		const otherHeaders = new Headers();
		await client.signUp.email(
			{ email: "other@example.com", password: "other-password", name: "Other" },
			{
				onSuccess: sessionSetter(otherHeaders),
			},
		);
		await client.changeEmail(
			{ newEmail: "owner-new@example.com" },
			{ headers },
		);
		const response = await auth.handler(
			new Request(url, { headers: otherHeaders }),
		);
		expect(response.headers.get("location")).toContain("error=INVALID_TOKEN");
		expect(response.headers.getSetCookie()).toEqual([]);
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: user.id }],
			}),
		).toMatchObject({
			email: user.email,
			pendingEmail: "owner-new@example.com",
		});
		const owner = await auth.handler(new Request(url, { headers }));
		expect(owner.headers.get("location")).toBe("/");
	});

	it("does not announce cancellation when its database update is vetoed", async () => {
		const cancelled = vi.fn();
		const { client, db, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					sendVerificationEmail: async () => {},
					onChangeEmailCancelled: cancelled,
				},
			},
			databaseHooks: {
				user: {
					update: {
						before: async (data) =>
							data.pendingEmail === null ? false : undefined,
					},
				},
			},
		});
		const { headers, user } = await signInWithTestUser();
		await client.changeEmail({ newEmail: "veto@example.com" }, { headers });
		expect((await client.cancelEmailChange({}, { headers })).error?.code).toBe(
			"FAILED_TO_UPDATE_USER",
		);
		expect(cancelled).not.toHaveBeenCalled();
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: user.id }],
			}),
		).toMatchObject({ pendingEmail: "veto@example.com" });
	});

	it("revokes sessions before notifying completion of an anonymous email verification", async () => {
		let url = "";
		let count!: (userId: string) => Promise<number>;
		const remainingSessions: number[] = [];
		const { auth, client, db, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					revokeOtherSessions: true,
					sendVerificationEmail: async (data) => {
						url = data.url;
					},
					onChangeEmailCompleted: async ({ user }) => {
						remainingSessions.push(await count(user.id));
					},
				},
			},
		});
		count = (userId) =>
			db.count({
				model: "session",
				where: [{ field: "userId", value: userId }],
			});
		const { headers, user } = await signInWithTestUser();
		expect(await count(user.id)).toBeGreaterThan(0);
		await client.changeEmail({ newEmail: "revoked@example.com" }, { headers });
		expect((await auth.handler(new Request(url))).headers.get("location")).toBe(
			"/",
		);
		expect(remainingSessions).toEqual([0]);
	});

	it.each([
		"requested",
		"completed",
		"cancelled",
	] as const)("completes email-change security work when the %s callback throws synchronously", async (stage) => {
		let url = "";
		const broken = () => {
			throw new Error("audit unavailable");
		};
		const { auth, client, db, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					revokeOtherSessions: true,
					sendVerificationEmail: async (data) => {
						url = data.url;
					},
					onChangeEmailRequested: stage === "requested" ? broken : undefined,
					onChangeEmailCompleted: stage === "completed" ? broken : undefined,
					onChangeEmailCancelled: stage === "cancelled" ? broken : undefined,
				},
			},
		});
		const { headers, user } = await signInWithTestUser();
		expect(
			(
				await client.changeEmail(
					{ newEmail: "callback@example.com" },
					{ headers },
				)
			).error,
		).toBeNull();
		if (stage === "cancelled") {
			expect(
				(await client.cancelEmailChange({}, { headers })).error,
			).toBeNull();
			expect(
				await db.findOne({
					model: "user",
					where: [{ field: "id", value: user.id }],
				}),
			).toMatchObject({ email: user.email, pendingEmail: null });
		} else {
			const response = await auth.handler(new Request(url));
			expect(response.status).toBe(302);
			expect(response.headers.get("location")).toBe("/");
			expect(
				await db.count({
					model: "session",
					where: [{ field: "userId", value: user.id }],
				}),
			).toBe(0);
		}
	});

	it.each([
		false,
		true,
	])("retains an owner's authenticated session or replaces it under revocation: %s", async (revokeOtherSessions) => {
		let url = "";
		const { auth, client, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					revokeOtherSessions,
					sendVerificationEmail: async (data) => {
						url = data.url;
					},
				},
			},
		});
		const { headers } = await signInWithTestUser();
		const other = await signInWithTestUser();
		const before = await auth.api.getSession({ headers });
		await client.changeEmail({ newEmail: "session@example.com" }, { headers });
		const response = await auth.handler(new Request(url, { headers }));
		expect(response.headers.get("location")).toBe("/");
		const refreshedHeaders = new Headers({
			cookie: response.headers
				.getSetCookie()
				.map((cookie) => cookie.split(";")[0])
				.join("; "),
		});
		const current = await auth.api.getSession({ headers: refreshedHeaders });
		expect(current?.user.email).toBe("session@example.com");
		if (revokeOtherSessions) {
			expect(current?.session.token).not.toBe(before?.session.token);
			expect(await auth.api.getSession({ headers })).toBeNull();
			expect(await auth.api.getSession({ headers: other.headers })).toBeNull();
		} else {
			expect(current?.session.token).toBe(before?.session.token);
			expect(
				await auth.api.getSession({ headers: other.headers }),
			).not.toBeNull();
		}
	});

	it.each([
		"delivered",
		"sync-failure",
		"async-failure",
	] as const)("keeps public pending state indistinguishable for occupied and free addresses with %s", async (delivery) => {
		const send = vi.fn(() => {
			if (delivery === "sync-failure")
				throw new Error("delivery failed synchronously");
			if (delivery === "async-failure")
				return Promise.reject(new Error("delivery failed asynchronously"));
			return Promise.resolve();
		});
		const requested = vi.fn();
		const { auth, client, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					sendVerificationEmail: send,
					onChangeEmailRequested: requested,
				},
			},
		});
		await (await auth.$context).internalAdapter.createUser(
			{ name: "Other", email: "occupied@example.com" },
			{ method: "test" },
		);
		const { headers } = await signInWithTestUser();
		for (const newEmail of ["available@example.com", "occupied@example.com"]) {
			const result = await client.changeEmail({ newEmail }, { headers });
			expect(result.error).toBeNull();
			expect(result.data).toEqual({ status: true });
			expect(
				(await client.getSession({ fetchOptions: { headers } })).data?.user,
			).toMatchObject({ pendingEmail: newEmail });
			expect(
				(await client.cancelEmailChange({}, { headers })).data?.status,
			).toBe(true);
		}
		expect(send).toHaveBeenCalledOnce();
		expect(requested).toHaveBeenCalledTimes(2);
	});

	it("exposes the pending address in inferred users while keeping its request identity private", async () => {
		const options = {
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					sendVerificationEmail: async () => {},
				},
				fields: {
					pendingEmail: "pending_email",
					pendingEmailRequestId: "pending_email_request_id",
				},
			},
		} as const;
		const { auth, client, signInWithTestUser } = await getTestInstance(
			options,
			{
				clientOptions: { plugins: [inferAdditionalFields<typeof options>()] },
			},
		);
		expectTypeOf<typeof client.$Infer.Session.user>()
			.toHaveProperty("pendingEmail")
			.toEqualTypeOf<string | null | undefined>();
		expectTypeOf<typeof client.$Infer.Session.user>().not.toHaveProperty(
			"pendingEmailRequestId",
		);
		expectTypeOf<typeof auth.$Infer.Session.user>()
			.toHaveProperty("pendingEmail")
			.toEqualTypeOf<string | null | undefined>();
		const { headers } = await signInWithTestUser();
		await client.changeEmail({ newEmail: "typed@example.com" }, { headers });
		for (const field of ["pendingEmail", "pendingEmailRequestId"]) {
			const result = await client.$fetch("/update-user", {
				method: "POST",
				headers,
				body: { [field]: "injected@example.com" },
			});
			expect(result.error?.status).toBe(400);
		}

		const session = await auth.api.getSession({ headers });
		expect(session?.user).toMatchObject({ pendingEmail: "typed@example.com" });
		expect(session?.user).not.toHaveProperty("pendingEmailRequestId");
		expect(
			(await client.getSession({ fetchOptions: { headers } })).data?.user,
		).toMatchObject({ pendingEmail: "typed@example.com" });
	});
});
