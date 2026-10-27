import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { sso } from ".";
import { ssoClient } from "./client";

const dnsMock = vi.hoisted(() => ({ resolveTxt: vi.fn() }));

vi.mock("node:dns/promises", () => ({ ...dnsMock, default: dnsMock }));

/**
 * @see https://github.com/better-auth/better-auth/issues/10424
 */
describe("domain verification record details", () => {
	afterEach(() => {
		vi.useRealTimers();
		dnsMock.resolveTxt.mockReset();
	});

	it.each([
		{ tokenPrefix: undefined, identifier: "_better-auth-token-workforce" },
		{ tokenPrefix: "custom-auth", identifier: "_custom-auth-workforce" },
		{ tokenPrefix: "", identifier: "_better-auth-token-workforce" },
	])(
		"exposes the DNS identifier for tokenPrefix=$tokenPrefix through the client",
		async ({ tokenPrefix, identifier }) => {
			const { auth, client, signInWithTestUser } = await getTestInstance(
				{
					session: { expiresIn: 60 * 60 * 24 * 30 },
					plugins: [
						sso({ domainVerification: { enabled: true, tokenPrefix } }),
					],
				},
				{
					clientOptions: {
						plugins: [ssoClient({ domainVerification: { enabled: true } })],
					},
				},
			);
			const { headers } = await signInWithTestUser();
			const provider = await auth.api.registerSSOProvider({
				headers,
				body: {
					providerId: "workforce",
					issuer: "https://idp.example.com",
					domain: "example.com",
					samlConfig: {
						entryPoint: "https://idp.example.com/sso",
						cert: "test-certificate",
						idpMetadata: { entityID: "https://idp.example.com" },
						spMetadata: {},
					},
				},
			});

			const existing = await client.sso.requestDomainVerification({
				providerId: provider.providerId,
				fetchOptions: { headers },
			});
			expect(existing.error).toBeNull();
			expect(existing.data).toEqual({
				domainVerificationIdentifier: identifier,
				domainVerificationToken: provider.domainVerificationToken,
			});
			expectTypeOf(existing.data!.domainVerificationIdentifier).toBeString();

			vi.useFakeTimers({ toFake: ["Date"] });
			vi.advanceTimersByTime(60 * 60 * 24 * 8 * 1000);

			const renewed = await client.sso.requestDomainVerification({
				providerId: provider.providerId,
				fetchOptions: { headers },
			});
			expect(renewed.error).toBeNull();
			expect(renewed.data).toEqual({
				domainVerificationIdentifier: identifier,
				domainVerificationToken: expect.any(String),
			});
			expect(renewed.data!.domainVerificationToken).not.toBe(
				provider.domainVerificationToken,
			);

			dnsMock.resolveTxt.mockResolvedValue([
				[renewed.data!.domainVerificationToken],
			]);
			const verified = await client.sso.verifyDomain({
				providerId: provider.providerId,
				fetchOptions: { headers },
			});
			expect(verified.error).toBeNull();
			expect(dnsMock.resolveTxt).toHaveBeenCalledWith(
				`${renewed.data!.domainVerificationIdentifier}.example.com`,
			);
		},
	);
});
