import type { DBTransactionAdapter, ProviderUserProfile } from "better-auth";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { SSOOptions, SSOUserResolutionInput } from "./types";
import { resolveSSOUser } from "./user-resolution";

const input = {
	protocol: "oidc",
	providerId: "workforce",
	providerInstanceId: "sso:config:workforce",
	identity: {
		issuer: "https://idp.example.com",
		providerAccountId: "directory-user-1",
	},
	providerUser: {
		email: "employee@example.com",
		emailVerified: true,
		name: "Directory Employee",
		image: null,
	},
	providerClaims: { sub: "directory-user-1" },
} satisfies SSOUserResolutionInput;

const database = {} as DBTransactionAdapter;

describe("SSO user resolution", () => {
	it("preserves mapped provider profile field types", () => {
		const mappedProviderUser = {
			email: "employee@example.com",
			emailVerified: true,
			name: "Directory Employee",
			image: null,
			department: "Engineering",
		} satisfies ProviderUserProfile;
		type WorkforceResolutionInput = SSOUserResolutionInput<{
			department: string;
			employeeNumber: number;
		}>;

		expectTypeOf(mappedProviderUser.department).toEqualTypeOf<string>();
		expectTypeOf<
			WorkforceResolutionInput["providerUser"]["department"]
		>().toEqualTypeOf<string>();
		expectTypeOf<
			WorkforceResolutionInput["providerUser"]["employeeNumber"]
		>().toEqualTypeOf<number>();
		expectTypeOf<
			SSOUserResolutionInput["providerUser"]["department"]
		>().toEqualTypeOf<unknown>();
		expectTypeOf<
			WorkforceResolutionInput["providerUser"]["email"]
		>().toEqualTypeOf<string>();
		expectTypeOf<
			WorkforceResolutionInput["providerUser"]["id"]
		>().toEqualTypeOf<undefined>();
	});

	it("logs resolver exceptions while returning a stable error", async () => {
		const privateError = new Error("private directory topology");
		const logger = { error: vi.fn() };

		await expect(
			resolveSSOUser(
				() => {
					throw privateError;
				},
				input,
				database,
				logger,
			),
		).rejects.toMatchObject({
			body: {
				code: "SSO_USER_RESOLUTION_FAILED",
				message: "Unable to resolve the SSO user",
			},
		});
		expect(logger.error).toHaveBeenCalledWith(
			"SSO user resolution failed",
			privateError,
		);
	});

	it("logs malformed decisions without logging their value", async () => {
		const logger = { error: vi.fn() };
		const malformedResolver = (() => ({
			action: "link",
			userId: "user-1",
		})) as unknown as NonNullable<SSOOptions["resolveUser"]>;

		await expect(
			resolveSSOUser(malformedResolver, input, database, logger),
		).rejects.toMatchObject({
			body: { code: "SSO_USER_RESOLUTION_FAILED" },
		});
		expect(logger.error).toHaveBeenCalledWith(
			"SSO user resolver returned an invalid decision",
		);
	});
});
