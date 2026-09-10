import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

const applyCookies = (response: Response, headers: Headers) => {
	const jar = new Map(
		(headers.get("cookie") ?? "")
			.split("; ")
			.filter(Boolean)
			.map((entry) => {
				const index = entry.indexOf("=");
				return [entry.slice(0, index), entry.slice(index + 1)];
			}),
	);
	for (const cookie of response.headers.getSetCookie()) {
		const pair = cookie.split(";")[0]!;
		const index = pair.indexOf("=");
		const name = pair.slice(0, index);
		if (/;\s*max-age=0(?:;|$)/i.test(cookie)) jar.delete(name);
		else jar.set(name, pair.slice(index + 1));
	}
	headers.set(
		"cookie",
		[...jar].map(([name, value]) => `${name}=${value}`).join("; "),
	);
};

/** @see https://github.com/better-auth/better-auth/pull/8916 */
describe("verification-table session authority and completion", () => {
	it("preserves independent HTTP request bodies for requested, sender and cancellation callbacks", async () => {
		const sent = vi.fn();
		const requested = vi.fn();
		const cancelled = vi.fn();
		const { auth, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					sendVerificationEmail: async (_data, request) => {
						sent(await request!.json());
					},
					onChangeEmailRequested: async (_data, request) => {
						requested(await request!.json());
					},
					onChangeEmailCancelled: async (_data, request) => {
						cancelled(await request!.json());
					},
				},
			},
		});
		const { headers } = await signInWithTestUser();
		headers.set("content-type", "application/json");
		const { baseURL } = await auth.$context;
		const body = { newEmail: "body@example.com" };
		const requestedResponse = await auth.handler(
			new Request(`${baseURL}/change-email`, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			}),
		);
		expect(requestedResponse.status).toBe(200);
		expect(requested).toHaveBeenCalledWith(body);
		expect(sent).toHaveBeenCalledWith(body);
		const cancelledBody = { reason: "discard" };
		const cancelledResponse = await auth.handler(
			new Request(`${baseURL}/cancel-email-change`, {
				method: "POST",
				headers,
				body: JSON.stringify(cancelledBody),
			}),
		);
		expect(cancelledResponse.status).toBe(200);
		expect(cancelled).toHaveBeenCalledWith(cancelledBody);
	});

	it.each([
		"verification veto",
		"pending email",
		"request identity",
	] as const)("does not announce a request when persistence fails: %s", async (failure) => {
		let interfere = false;
		const send = vi.fn();
		const requested = vi.fn();
		const { client, db, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					sendVerificationEmail: send,
					onChangeEmailRequested: requested,
				},
			},
			databaseHooks: {
				verification: {
					create: {
						before: async () => {
							if (interfere && failure === "verification veto") return false;
						},
					},
				},
				user: {
					update: {
						before: async () => {
							if (!interfere) return;
							if (failure === "pending email")
								return { data: { pendingEmail: null } };
							if (failure === "request identity")
								return { data: { pendingEmailRequestId: "different-request" } };
						},
					},
				},
			},
		});
		const { headers, user } = await signInWithTestUser();
		await client.changeEmail({ newEmail: "first@example.com" }, { headers });
		const before = await db.findOne({
			model: "user",
			where: [{ field: "id", value: user.id }],
		});
		expect(send).toHaveBeenCalledOnce();
		expect(requested).toHaveBeenCalledOnce();
		interfere = true;
		const response = await client.changeEmail(
			{ newEmail: "second@example.com" },
			{ headers },
		);
		expect(response.error).not.toBeNull();
		expect(send).toHaveBeenCalledOnce();
		expect(requested).toHaveBeenCalledOnce();
		if (failure === "verification veto") {
			expect(
				await db.findOne({
					model: "user",
					where: [{ field: "id", value: user.id }],
				}),
			).toEqual(before);
		}
	});

	it("rejects the non-atomic secondary-storage combination before writing a pending request", async () => {
		const store = new Map<string, string>();
		const send = vi.fn();
		const { client, db, signInWithTestUser } = await getTestInstance({
			secondaryStorage: {
				get: async (key) => store.get(key) ?? null,
				set: async (key, value) => {
					store.set(key, value);
				},
				delete: async (key) => {
					store.delete(key);
				},
				getAndDelete: async (key) => {
					const value = store.get(key) ?? null;
					store.delete(key);
					return value;
				},
				increment: async (key) => {
					const value = Number(store.get(key) ?? 0) + 1;
					store.set(key, String(value));
					return value;
				},
			},
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					revokeOtherSessions: true,
					sendVerificationEmail: send,
				},
			},
		});
		const { headers, user } = await signInWithTestUser();
		expect(
			(
				await client.changeEmail(
					{ newEmail: "unsupported@example.com" },
					{ headers },
				)
			).error?.status,
		).toBe(500);
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: user.id }],
			}),
		).toMatchObject({ pendingEmail: null });
		expect(send).not.toHaveBeenCalled();
	});
	it.each([
		"session deletion",
		"session creation",
		"session owner",
	] as const)("rolls back email verification when %s is vetoed and allows retrying the same link", async (failure) => {
		let url = "";
		let verifying = false;
		let deleted = 0;
		let vetoAt = 0;
		let replacementOwner = "";
		const completed = vi.fn();
		const afterUpdate = vi.fn();
		const { auth, client, db, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					revokeOtherSessions: true,
					sendVerificationEmail: async (data) => {
						url = data.url;
					},
					onChangeEmailCompleted: completed,
				},
			},
			databaseHooks: {
				user: { update: { after: afterUpdate } },
				session: {
					delete: {
						before: async () => {
							if (
								verifying &&
								failure === "session deletion" &&
								++deleted === vetoAt
							)
								return false;
						},
					},
					create: {
						before: async () => {
							if (verifying && failure === "session creation") return false;
							if (verifying && failure === "session owner")
								return { data: { userId: replacementOwner } };
						},
					},
				},
			},
		});
		const otherUser = await db.create<{ id: string }>({
			model: "user",
			data: {
				name: "Other",
				email: "other@example.com",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		replacementOwner = otherUser.id;
		const first = await signInWithTestUser();
		const second = await signInWithTestUser();
		const beforeTokens = (
			await db.findMany<{ token: string }>({
				model: "session",
				where: [{ field: "userId", value: first.user.id }],
			})
		)
			.map((session) => session.token)
			.sort();
		expect(beforeTokens.length).toBeGreaterThanOrEqual(2);
		vetoAt = beforeTokens.length;
		await client.changeEmail(
			{ newEmail: "atomic@example.com" },
			{ headers: first.headers },
		);
		afterUpdate.mockClear();
		verifying = true;
		const response = await auth.handler(
			new Request(url, { headers: first.headers }),
		);
		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(completed).not.toHaveBeenCalled();
		expect(afterUpdate).not.toHaveBeenCalled();
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: first.user.id }],
			}),
		).toMatchObject({
			email: first.user.email,
			pendingEmail: "atomic@example.com",
		});
		for (const { headers } of [first, second])
			expect(await auth.api.getSession({ headers })).not.toBeNull();
		expect(
			(
				await db.findMany<{ token: string }>({
					model: "session",
					where: [{ field: "userId", value: first.user.id }],
				})
			)
				.map((session) => session.token)
				.sort(),
		).toEqual(beforeTokens);
		verifying = false;
		expect(
			(
				await auth.handler(new Request(url, { headers: first.headers }))
			).headers.get("location"),
		).toBe("/");
		expect(completed).toHaveBeenCalledOnce();
	});

	it("refuses session revocation without a real transaction before persisting a pending request", async () => {
		const { auth, client, db, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					revokeOtherSessions: true,
					sendVerificationEmail: async () => {},
				},
			},
		});
		const { headers, user } = await signInWithTestUser();
		const context = await auth.$context;
		context.adapter.options!.adapterConfig.transaction = false;
		const result = await client.changeEmail(
			{ newEmail: "unsupported@example.com" },
			{ headers },
		);
		expect(result.error?.status).toBe(500);
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: user.id }],
			}),
		).toMatchObject({ pendingEmail: null });
	});
	it.each([
		"cancel",
		"verify",
	] as const)("does not authorize %s from a revoked cookie-cache session", async (operation) => {
		let url = "";
		const { auth, client, db, testUser } = await getTestInstance({
			session: { cookieCache: { enabled: true, maxAge: 300 } },
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					revokeOtherSessions: true,
					sendVerificationEmail: async (data) => {
						url = data.url;
					},
				},
			},
		});
		const headers = new Headers();
		await client.signIn.email(
			{ email: testUser.email, password: testUser.password },
			{ onSuccess: ({ response }) => applyCookies(response, headers) },
		);
		expect(headers.get("cookie")).toContain("session_data=");
		const before = await auth.api.getSession({ headers });
		expect(before).not.toBeNull();
		await client.changeEmail(
			{ newEmail: "changed@example.com" },
			{ headers, onSuccess: ({ response }) => applyCookies(response, headers) },
		);
		await db.deleteMany({
			model: "session",
			where: [{ field: "userId", value: before!.user.id }],
		});
		if (operation === "cancel") {
			expect(
				(await client.cancelEmailChange({}, { headers })).error?.status,
			).toBe(401);
			expect(
				await db.findOne({
					model: "user",
					where: [{ field: "id", value: before!.user.id }],
				}),
			).toMatchObject({ pendingEmail: "changed@example.com" });
		} else {
			const response = await auth.handler(new Request(url, { headers }));
			expect(response.headers.get("location")).toBe("/");
			applyCookies(response, headers);
			expect(
				await auth.api.getSession({
					headers,
					query: { disableCookieCache: true },
				}),
			).toBeNull();
			expect(
				await db.count({
					model: "session",
					where: [{ field: "userId", value: before!.user.id }],
				}),
			).toBe(0);
		}
	});

	it("refreshes pending state in the cookie jar without replacing the session or exposing the private request ID", async () => {
		const { auth, client, testUser } = await getTestInstance({
			session: { cookieCache: { enabled: true, maxAge: 300 } },
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					sendVerificationEmail: async () => {},
				},
			},
		});
		const headers = new Headers();
		const onSuccess = ({ response }: { response: Response }) =>
			applyCookies(response, headers);
		await client.signIn.email(
			{ email: testUser.email, password: testUser.password },
			{ onSuccess },
		);
		const before = await auth.api.getSession({ headers });
		await client.changeEmail(
			{ newEmail: "pending@example.com" },
			{ headers, onSuccess },
		);
		const pending = await auth.api.getSession({ headers });
		expect(pending?.user).toMatchObject({
			pendingEmail: "pending@example.com",
		});
		expect(pending?.user).not.toHaveProperty("pendingEmailRequestId");
		expect(pending?.session.token).toBe(before?.session.token);
		await client.cancelEmailChange({}, { headers, onSuccess });
		const cancelled = await auth.api.getSession({ headers });
		expect(cancelled?.user).toMatchObject({ pendingEmail: null });
		expect(cancelled?.session.token).toBe(before?.session.token);
	});

	it.each([
		"email",
		"emailVerified",
		"pendingEmail",
		"pendingEmailRequestId",
	] as const)("does not announce completion if a hook rewrites %s", async (field) => {
		let url = "";
		const completed = vi.fn();
		const { auth, client, signInWithTestUser } = await getTestInstance({
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					revokeOtherSessions: true,
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
							if (data.email !== "hook@example.com") return;
							return {
								data: {
									...data,
									[field]:
										field === "emailVerified" ? false : "rewritten@example.com",
								},
							};
						},
					},
				},
			},
		});
		const { headers } = await signInWithTestUser();
		const other = await signInWithTestUser();
		await client.changeEmail({ newEmail: "hook@example.com" }, { headers });
		const response = await auth.handler(new Request(url, { headers }));
		expect(response.headers.get("location")).toContain("error=INVALID_TOKEN");
		expect(completed).not.toHaveBeenCalled();
		expect(
			await auth.api.getSession({ headers: other.headers }),
		).not.toBeNull();
	});

	it("hands blocked SMTP delivery to the configured background handler before responding", async () => {
		const delivery = Promise.withResolvers<void>();
		const tasks: Promise<unknown>[] = [];
		const send = vi.fn(() => delivery.promise);
		const { auth, client, signInWithTestUser } = await getTestInstance({
			advanced: {
				backgroundTasks: {
					handler: (task) => {
						tasks.push(task);
					},
				},
			},
			user: {
				changeEmail: {
					enabled: true,
					strategy: "verification-table",
					sendVerificationEmail: send,
				},
			},
		});
		const { headers } = await signInWithTestUser();
		let responded = false;
		const request = client
			.changeEmail({ newEmail: "background@example.com" }, { headers })
			.then((result) => {
				responded = true;
				return result;
			});
		try {
			await expect.poll(() => send.mock.calls.length).toBe(1);
			await expect.poll(() => responded, { timeout: 1000 }).toBe(true);
			expect((await request).data).toEqual({ status: true });
			expect((await auth.api.getSession({ headers }))?.user).toMatchObject({
				pendingEmail: "background@example.com",
			});
		} finally {
			delivery.resolve();
			await request;
			await Promise.all(tasks);
		}
	});
});

/** @see https://github.com/better-auth/better-auth/pull/8916 */
it.each([
	false,
	true,
])("consumes an occupied target request without changing sessions (revocation: %s)", async (revokeOtherSessions) => {
	let url = "";
	const completed = vi.fn();
	const { auth, client, db, signInWithTestUser } = await getTestInstance({
		session: { cookieCache: { enabled: true, maxAge: 300 } },
		user: {
			changeEmail: {
				enabled: true,
				strategy: "verification-table",
				revokeOtherSessions,
				sendVerificationEmail: async (data) => {
					url = data.url;
				},
				onChangeEmailCompleted: completed,
			},
		},
	});
	const { headers, user } = await signInWithTestUser();
	const sessions = await db.findMany({
		model: "session",
		where: [{ field: "userId", value: user.id }],
	});
	const request = await client.changeEmail(
		{ newEmail: "claimed@example.com" },
		{ headers, onSuccess: ({ response }) => applyCookies(response, headers) },
	);
	expect(request.error).toBeNull();
	expect(url).not.toBe("");
	expect((await auth.api.getSession({ headers }))?.user).toMatchObject({
		pendingEmail: "claimed@example.com",
	});
	const claimant = await db.create<{ id: string }>({
		model: "user",
		data: {
			name: "Claimant",
			email: "claimed@example.com",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
	const response = await auth.handler(new Request(url, { headers }));
	expect(response.status).toBe(302);
	expect(response.headers.get("location")).toContain("INVALID_TOKEN");
	applyCookies(response, headers);
	expect((await auth.api.getSession({ headers }))?.user).toMatchObject({
		pendingEmail: null,
	});
	expect(
		await db.findOne({
			model: "user",
			where: [{ field: "id", value: user.id }],
		}),
	).toMatchObject({
		email: user.email,
		pendingEmail: null,
		pendingEmailRequestId: null,
	});
	expect(
		await db.findMany({
			model: "session",
			where: [{ field: "userId", value: user.id }],
		}),
	).toEqual(sessions);
	await db.delete({
		model: "user",
		where: [{ field: "id", value: claimant.id }],
	});
	const replay = await auth.handler(new Request(url, { headers }));
	expect(replay.headers.get("location")).toContain("INVALID_TOKEN");
	expect(completed).not.toHaveBeenCalled();
});

/** @see https://github.com/better-auth/better-auth/pull/8916#discussion_r3976670283 */
it.each([
	{ chunked: false, revokeOtherSessions: false },
	{ chunked: true, revokeOtherSessions: false },
	{ chunked: false, revokeOtherSessions: true },
	{ chunked: true, revokeOtherSessions: true },
])("does not recache a concurrently revoked session after rejecting an occupied target (%j)", async ({
	chunked,
	revokeOtherSessions,
}) => {
	let url = "";
	const completed = vi.fn();
	const { auth, client, db, signInWithTestUser } = await getTestInstance({
		session: { cookieCache: { enabled: true, maxAge: 300 } },
		user: {
			additionalFields: {
				cachePadding: {
					type: "string",
					defaultValue: chunked ? "x".repeat(5000) : "",
				},
			},
			changeEmail: {
				enabled: true,
				strategy: "verification-table",
				revokeOtherSessions,
				sendVerificationEmail: async (data) => {
					url = data.url;
				},
				onChangeEmailCompleted: completed,
			},
		},
	});
	const { headers, user } = await signInWithTestUser();
	const requested = await client.changeEmail(
		{ newEmail: "claimed@example.com" },
		{ headers, onSuccess: ({ response }) => applyCookies(response, headers) },
	);
	expect(requested.error).toBeNull();
	const current = await auth.api.getSession({ headers });
	expect(current?.user).toMatchObject({ pendingEmail: "claimed@example.com" });
	const context = await auth.$context;
	const cacheName = context.authCookies.sessionData.name;
	expect(headers.get("cookie")?.includes(`${cacheName}.0=`)).toBe(chunked);
	await db.create({
		model: "user",
		data: {
			name: "Claimant",
			email: "claimed@example.com",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
	const updateUserIf = context.internalAdapter.updateUserIf.bind(
		context.internalAdapter,
	);
	const cleanup = vi
		.spyOn(context.internalAdapter, "updateUserIf")
		.mockImplementationOnce(async (...args) => {
			const updated = await updateUserIf(...args);
			await db.delete({
				model: "session",
				where: [{ field: "token", value: current!.session.token }],
			});
			return updated;
		});
	const response = await auth.handler(new Request(url, { headers }));
	expect(response.status).toBe(302);
	expect(response.headers.get("location")).toContain("INVALID_TOKEN");
	expect(cleanup).toHaveBeenCalledOnce();
	expect(
		await db.findOne({
			model: "session",
			where: [{ field: "token", value: current!.session.token }],
		}),
	).toBeNull();
	applyCookies(response, headers);
	expect(await auth.api.getSession({ headers })).toBeNull();
	const cachedCookies = response.headers
		.getSetCookie()
		.filter(
			(cookie) =>
				cookie.startsWith(`${cacheName}=`) ||
				cookie.startsWith(`${cacheName}.`),
		);
	expect(cachedCookies.length).toBeGreaterThan(0);
	expect(
		cachedCookies.every((cookie) => /;\s*max-age=0(?:;|$)/i.test(cookie)),
	).toBe(true);
	expect(
		await db.findOne({
			model: "user",
			where: [{ field: "id", value: user.id }],
		}),
	).toMatchObject({ email: user.email, pendingEmail: null });
	expect(completed).not.toHaveBeenCalled();
});
