import type { GenericEndpointContext } from "@better-auth/core";
import { runWithEndpointContext } from "@better-auth/core/context";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { describe, expect, it } from "vitest";
import { emailOTP } from "./plugins/email-otp";
import { getTestInstance } from "./test-utils/test-instance";

const sharedEmail = "jane@example.com";
const passwordA = "tenant-a-password";
const passwordB = "tenant-b-password";

function tenantHeaders(tenantId: string, token?: string) {
	return new Headers({
		"x-tenant-id": tenantId,
		...(token ? { authorization: `Bearer ${token}` } : {}),
	});
}

function tenantOptions() {
	return {
		user: {
			additionalFields: {
				tenantId: {
					type: "string" as const,
					required: true as const,
					input: false as const,
				},
			},
			identityScope: {
				field: "tenantId",
				resolve: ({
					headers,
					request,
				}: {
					headers?: Headers;
					request?: Request;
				}) => (request?.headers ?? headers)?.get("x-tenant-id") ?? null,
			},
		},
	};
}

describe("tenant-scoped identity", async () => {
	it("allows the same email with independent passwords and sessions", async () => {
		const { auth, db } = await getTestInstance(tenantOptions(), {
			disableTestUser: true,
		});
		expect((await auth.$context).adapter).toBeDefined();

		const userA = await auth.api.signUpEmail({
			headers: tenantHeaders("tenant-a"),
			body: { email: sharedEmail, name: "Jane A", password: passwordA },
		});
		const userB = await auth.api.signUpEmail({
			headers: tenantHeaders("tenant-b"),
			body: { email: sharedEmail, name: "Jane B", password: passwordB },
		});

		expect(userA.user.id).not.toBe(userB.user.id);

		const signInA = await auth.api.signInEmail({
			headers: tenantHeaders("tenant-a"),
			body: { email: sharedEmail, password: passwordA },
		});

		expect(signInA).toMatchObject({ user: { tenantId: "tenant-a" } });
		await expect(
			auth.api.signInEmail({
				headers: tenantHeaders("tenant-b"),
				body: { email: sharedEmail, password: passwordA },
			}),
		).rejects.toMatchObject({ status: "UNAUTHORIZED" });

		const sessionA = await auth.api.getSession({
			headers: tenantHeaders("tenant-a", signInA!.token),
		});
		const crossTenantSession = await auth.api.getSession({
			headers: tenantHeaders("tenant-b", signInA!.token),
		});

		expect(sessionA?.user.tenantId).toBe("tenant-a");
		expect(crossTenantSession).toBeNull();

		const users = await db.findMany<{
			email: string;
			tenantId: string;
		}>({ model: "user" });
		expect(users).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					email: sharedEmail,
					tenantId: "tenant-a",
				}),
				expect.objectContaining({
					email: sharedEmail,
					tenantId: "tenant-b",
				}),
			]),
		);
	});

	it("scopes email OTP verification identifiers", async () => {
		const sentCodes = new Map<string, string>();
		const { auth } = await getTestInstance(
			{
				...tenantOptions(),
				plugins: [
					emailOTP({
						disableSignUp: true,
						generateOTP: () => "123456",
						async sendVerificationOTP({ otp }, context) {
							const tenantId =
								(context?.request?.headers ?? context?.headers)?.get(
									"x-tenant-id",
								) ?? "";
							sentCodes.set(tenantId, otp);
						},
					}),
				],
			},
			{ disableTestUser: true },
		);

		await auth.api.signUpEmail({
			headers: tenantHeaders("tenant-a"),
			body: { email: sharedEmail, name: "Jane A", password: passwordA },
		});
		await auth.api.signUpEmail({
			headers: tenantHeaders("tenant-b"),
			body: { email: sharedEmail, name: "Jane B", password: passwordB },
		});

		await auth.api.sendVerificationOTP({
			headers: tenantHeaders("tenant-a"),
			body: { email: sharedEmail, type: "sign-in" },
		});

		await expect(
			auth.api.signInEmailOTP({
				headers: tenantHeaders("tenant-b"),
				body: { email: sharedEmail, otp: sentCodes.get("tenant-a")! },
			}),
		).rejects.toMatchObject({ status: "BAD_REQUEST" });
		const correctTenant = await auth.api.signInEmailOTP({
			headers: tenantHeaders("tenant-a"),
			body: { email: sharedEmail, otp: sentCodes.get("tenant-a")! },
		});

		expect(correctTenant.user).toHaveProperty("tenantId", "tenant-a");
	});

	it("rejects email verification tokens issued by another tenant", async () => {
		const tokens = new Map<string, string>();
		const { auth, db } = await getTestInstance(
			{
				...tenantOptions(),
				emailVerification: {
					sendOnSignUp: true,
					async sendVerificationEmail({ token, user }) {
						tokens.set(
							(user as typeof user & { tenantId: string }).tenantId,
							token,
						);
					},
				},
			},
			{ disableTestUser: true },
		);

		await auth.api.signUpEmail({
			headers: tenantHeaders("tenant-a"),
			body: { email: sharedEmail, name: "Jane A", password: passwordA },
		});
		await auth.api.signUpEmail({
			headers: tenantHeaders("tenant-b"),
			body: { email: sharedEmail, name: "Jane B", password: passwordB },
		});
		expect(
			await db.findMany<{ emailVerified: boolean; tenantId: string }>({
				model: "user",
			}),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					emailVerified: false,
					tenantId: "tenant-a",
				}),
				expect.objectContaining({
					emailVerified: false,
					tenantId: "tenant-b",
				}),
			]),
		);

		await expect(
			auth.api.verifyEmail({
				headers: tenantHeaders("tenant-b"),
				query: { token: tokens.get("tenant-a")! },
			}),
		).rejects.toMatchObject({ status: "UNAUTHORIZED" });
		expect(
			await db.findMany<{ emailVerified: boolean; tenantId: string }>({
				model: "user",
			}),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					emailVerified: false,
					tenantId: "tenant-a",
				}),
				expect.objectContaining({
					emailVerified: false,
					tenantId: "tenant-b",
				}),
			]),
		);

		const verified = await auth.api.verifyEmail({
			headers: tenantHeaders("tenant-a"),
			query: { token: tokens.get("tenant-a")! },
		});
		expect(verified).toEqual({ status: true, user: null });

		const users = await db.findMany<{
			emailVerified: boolean;
			tenantId: string;
		}>({ model: "user" });
		expect(users).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					emailVerified: true,
					tenantId: "tenant-a",
				}),
				expect.objectContaining({
					emailVerified: false,
					tenantId: "tenant-b",
				}),
			]),
		);
	});

	it("scopes provider account lookup and linking", async () => {
		const { auth } = await getTestInstance(tenantOptions(), {
			disableTestUser: true,
		});
		const context = await auth.$context;
		const userA = await auth.api.signUpEmail({
			headers: tenantHeaders("tenant-a"),
			body: { email: sharedEmail, name: "Jane A", password: passwordA },
		});
		const userB = await auth.api.signUpEmail({
			headers: tenantHeaders("tenant-b"),
			body: { email: sharedEmail, name: "Jane B", password: passwordB },
		});

		const withTenant = <T>(tenantId: string, callback: () => Promise<T>) =>
			runWithEndpointContext(
				{
					context,
					request: new Request("http://localhost/api/auth/callback/google", {
						headers: tenantHeaders(tenantId),
					}),
				} as unknown as GenericEndpointContext,
				callback,
			);

		const googleAccount = {
			accountId: "google-subject",
			issuer: "https://accounts.google.com",
			providerId: "google",
		};

		await withTenant("tenant-a", () =>
			context.internalAdapter.createAccount({
				...googleAccount,
				userId: userA.user.id,
			}),
		);
		await withTenant("tenant-b", () =>
			context.internalAdapter.createAccount({
				...googleAccount,
				userId: userB.user.id,
			}),
		);
		await expect(
			withTenant("tenant-b", () =>
				context.internalAdapter.createAccount({
					accountId: "cross-tenant-subject",
					issuer: "https://accounts.google.com",
					providerId: "google",
					userId: userA.user.id,
				}),
			),
		).rejects.toThrow("across identity scopes");

		const foundA = await withTenant("tenant-a", () =>
			context.internalAdapter.findAccountOwnerByKey({
				accountId: googleAccount.accountId,
				issuer: googleAccount.issuer,
			}),
		);
		const foundB = await withTenant("tenant-b", () =>
			context.internalAdapter.findAccountOwnerByKey({
				accountId: googleAccount.accountId,
				issuer: googleAccount.issuer,
			}),
		);

		expect(foundA?.kind).toBe("owned");
		expect(foundB?.kind).toBe("owned");
		expect(foundA?.kind === "owned" && foundA.user.id).toBe(userA.user.id);
		expect(foundB?.kind === "owned" && foundB.user.id).toBe(userB.user.id);
	});

	it("fails closed when scope cannot be resolved", async () => {
		const { auth } = await getTestInstance(tenantOptions(), {
			disableTestUser: true,
		});

		await expect(
			auth.api.signUpEmail({
				body: {
					email: sharedEmail,
					name: "Jane",
					password: passwordA,
				},
			}),
		).rejects.toThrow("identity scope");
	});

	it("rejects numeric userId that belongs to another tenant", async () => {
		const { auth } = await getTestInstance(
			{
				...tenantOptions(),
				advanced: { database: { generateId: "serial" as const } },
			},
			{ disableTestUser: true },
		);
		const context = await auth.$context;
		const userA = await auth.api.signUpEmail({
			headers: tenantHeaders("tenant-a"),
			body: {
				email: "serial-a@example.com",
				name: "Jane A",
				password: passwordA,
			},
		});

		expect(typeof userA.user.id).toBe("string");
		expect(Number(userA.user.id)).not.toBeNaN();

		await expect(
			runWithEndpointContext(
				{
					context,
					request: new Request("http://localhost/api/auth/test", {
						headers: tenantHeaders("tenant-b"),
					}),
				} as unknown as GenericEndpointContext,
				() =>
					context.internalAdapter.createAccount({
						accountId: "cross-serial-num",
						issuer: "https://accounts.google.com",
						providerId: "google",
						userId: Number(userA.user.id) as unknown as string,
					}),
			),
		).rejects.toThrow("across identity scopes");
	});

	it("explains when a related user is missing its identity scope", async () => {
		const { auth, db } = await getTestInstance(tenantOptions(), {
			disableTestUser: true,
		});
		const context = await auth.$context;
		const user = await auth.api.signUpEmail({
			headers: tenantHeaders("tenant-a"),
			body: {
				email: "unbackfilled@example.com",
				name: "Jane",
				password: passwordA,
			},
		});

		await db.update({
			model: "user",
			where: [{ field: "id", value: user.user.id }],
			update: { tenantId: "" },
		});

		await expect(
			runWithEndpointContext(
				{
					context,
					request: new Request("http://localhost/api/auth/test", {
						headers: tenantHeaders("tenant-a"),
					}),
				} as unknown as GenericEndpointContext,
				() =>
					context.internalAdapter.createAccount({
						accountId: "unbackfilled-account",
						issuer: "https://accounts.google.com",
						providerId: "google",
						userId: user.user.id,
					}),
			),
		).rejects.toThrow("has not been backfilled");
	});

	it("includes identity scope on synthetic existing-email signups", async () => {
		const { auth } = await getTestInstance(
			{
				...tenantOptions(),
				emailAndPassword: {
					enabled: true,
					requireEmailVerification: true,
					autoSignIn: false,
				},
				emailVerification: {
					sendVerificationEmail: async () => {},
				},
			},
			{ disableTestUser: true },
		);

		const first = await auth.api.signUpEmail({
			headers: tenantHeaders("tenant-a"),
			body: {
				email: "enum@example.com",
				name: "First",
				password: passwordA,
			},
		});
		const duplicate = await auth.api.signUpEmail({
			headers: tenantHeaders("tenant-a"),
			body: {
				email: "enum@example.com",
				name: "Second",
				password: passwordB,
			},
		});

		expect(first.user).toMatchObject({ tenantId: "tenant-a" });
		expect(duplicate.user).toMatchObject({ tenantId: "tenant-a" });
		expect("tenantId" in duplicate.user).toBe("tenantId" in first.user);
	});

	it("binds email verification tokens when the user scope field is hidden", async () => {
		const { auth } = await getTestInstance(
			{
				user: {
					changeEmail: { enabled: true },
					additionalFields: {
						tenantId: {
							type: "string" as const,
							required: true as const,
							input: false as const,
							returned: false as const,
						},
					},
					identityScope: {
						field: "tenantId",
						resolve: ({
							headers,
							request,
						}: {
							headers?: Headers;
							request?: Request;
						}) => (request?.headers ?? headers)?.get("x-tenant-id") ?? null,
					},
				},
				emailAndPassword: { enabled: true },
				emailVerification: {
					sendVerificationEmail: async () => {},
				},
			},
			{ disableTestUser: true },
		);

		await auth.api.signUpEmail({
			headers: tenantHeaders("tenant-a"),
			body: {
				email: "hidden-scope@example.com",
				name: "Hidden",
				password: passwordA,
			},
		});
		const signIn = await auth.api.signInEmail({
			headers: tenantHeaders("tenant-a"),
			body: {
				email: "hidden-scope@example.com",
				password: passwordA,
			},
		});

		const changed = await auth.api.changeEmail({
			headers: tenantHeaders("tenant-a", signIn.token!),
			body: {
				newEmail: "hidden-scope-new@example.com",
				callbackURL: "http://localhost/callback",
			},
		});
		expect(changed).toEqual({ status: true });
	});

	it("reuses one identity-scope resolution across rebuilt adapters", async () => {
		let resolveCount = 0;
		let capturedAdapter: DBAdapter | null = null;
		const { auth } = await getTestInstance(
			{
				user: {
					additionalFields: {
						tenantId: {
							type: "string" as const,
							required: true as const,
							input: false as const,
						},
					},
					identityScope: {
						field: "tenantId",
						resolve: ({
							headers,
							request,
						}: {
							headers?: Headers;
							request?: Request;
						}) => {
							resolveCount += 1;
							return (request?.headers ?? headers)?.get("x-tenant-id") ?? null;
						},
					},
				},
				plugins: [
					{
						id: "capture-adapter",
						init(ctx) {
							capturedAdapter = ctx.adapter;
							return {};
						},
					},
				],
			},
			{ disableTestUser: true },
		);
		const context = await auth.$context;
		const user = await auth.api.signUpEmail({
			headers: tenantHeaders("tenant-a"),
			body: {
				email: "shared-cache@example.com",
				name: "A",
				password: passwordA,
			},
		});
		resolveCount = 0;

		await runWithEndpointContext(
			{
				context,
				request: new Request("http://localhost/api/auth/test", {
					headers: tenantHeaders("tenant-a"),
				}),
			} as unknown as GenericEndpointContext,
			async () => {
				await capturedAdapter!.findOne({
					model: "user",
					where: [{ field: "id", value: user.user.id }],
				});
				await context.adapter.findOne({
					model: "user",
					where: [{ field: "id", value: user.user.id }],
				});
			},
		);

		expect(resolveCount).toBe(1);
	});

	it("keeps adapters captured during plugin init identity-scoped", async () => {
		let capturedAdapter: DBAdapter | null = null;
		const { auth } = await getTestInstance(
			{
				...tenantOptions(),
				plugins: [
					{
						id: "capture-adapter",
						init(ctx) {
							capturedAdapter = ctx.adapter;
							return {};
						},
					},
				],
			},
			{ disableTestUser: true },
		);
		const context = await auth.$context;
		const userA = await auth.api.signUpEmail({
			headers: tenantHeaders("tenant-a"),
			body: {
				email: "capture-a@example.com",
				name: "A",
				password: passwordA,
			},
		});

		await expect(
			runWithEndpointContext(
				{
					context,
					request: new Request("http://localhost/api/auth/test", {
						headers: tenantHeaders("tenant-b"),
					}),
				} as unknown as GenericEndpointContext,
				() =>
					capturedAdapter!.create({
						model: "account",
						data: {
							accountId: "plugin-captured-bypass",
							issuer: "https://accounts.google.com",
							providerId: "google",
							userId: userA.user.id,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					}),
			),
		).rejects.toThrow("across identity scopes");
	});
});
