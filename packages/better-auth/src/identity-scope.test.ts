import type { GenericEndpointContext } from "@better-auth/core";
import { runWithEndpointContext } from "@better-auth/core/context";
import { describe, expect, it } from "vitest";
import { bearer } from "./plugins/bearer";
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
		plugins: [bearer()],
	};
}

describe("tenant-scoped identity", async () => {
	it("allows the same email with independent passwords and sessions", async () => {
		const { auth, db } = await getTestInstance(tenantOptions(), {
			disableTestUser: true,
		});
		expect((await auth.$context).checkSchema).toBeDefined();

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
					bearer(),
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

		await withTenant("tenant-a", () =>
			context.internalAdapter.createAccount({
				accountId: "google-subject",
				providerId: "google",
				userId: userA.user.id,
			}),
		);
		await withTenant("tenant-b", () =>
			context.internalAdapter.createAccount({
				accountId: "google-subject",
				providerId: "google",
				userId: userB.user.id,
			}),
		);
		await expect(
			withTenant("tenant-b", () =>
				context.internalAdapter.createAccount({
					accountId: "cross-tenant-subject",
					providerId: "google",
					userId: userA.user.id,
				}),
			),
		).rejects.toThrow("across identity scopes");

		const foundA = await withTenant("tenant-a", () =>
			context.internalAdapter.findAccountOwnerByKey({
				accountId: "google-subject",
				providerId: "google",
			}),
		);
		const foundB = await withTenant("tenant-b", () =>
			context.internalAdapter.findAccountOwnerByKey({
				accountId: "google-subject",
				providerId: "google",
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
});
