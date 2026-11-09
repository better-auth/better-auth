import type { AuthContext } from "better-auth";
import { describe, expect, it, vi } from "vitest";
import { lockSSOProviderForAccountLink } from "./routes/providers";

describe("SSO provider account-link locking", () => {
	it("does not bypass a persisted provider owned by user default", async () => {
		const update = vi.fn(async () => null);
		const context = {
			adapter: { update } as unknown as AuthContext["adapter"],
		} as AuthContext;

		await expect(
			lockSSOProviderForAccountLink(
				{ context },
				{
					id: "provider-row-1",
					providerId: "workforce",
					issuer: "https://idp.example.com",
					userId: "default",
				},
			),
		).rejects.toThrow(
			"SSO provider changed while account linking was in progress",
		);
		expect(update).toHaveBeenCalledOnce();
	});

	it("does not run a databaseHooks.ssoProvider.update hook during a sign-in lock", async () => {
		const lockedProvider = {
			id: "provider-row-1",
			providerId: "workforce",
			issuer: "https://idp.example.com",
			userId: "default",
		};
		const update = vi.fn(async () => lockedProvider);
		const before = vi.fn();
		const after = vi.fn();
		const context = {
			adapter: { update } as unknown as AuthContext["adapter"],
			options: {
				databaseHooks: {
					ssoProvider: { update: { before, after } },
				},
			},
		} as unknown as AuthContext;

		await lockSSOProviderForAccountLink({ context }, lockedProvider);

		expect(update).toHaveBeenCalledOnce();
		expect(before).not.toHaveBeenCalled();
		expect(after).not.toHaveBeenCalled();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11471
	 */
	it("rejects a sign-in whose SAML signing certificates changed before the lock", async () => {
		const samlConfig = (cert: string) => ({
			issuer: "https://sp.example.com",
			entryPoint: "https://idp.example.com/sso",
			cert,
			callbackUrl: "https://sp.example.com/dashboard",
			idpMetadata: { entityID: "https://idp.example.com" },
			spMetadata: {},
		});
		const provider = {
			id: "provider-row-1",
			providerId: "workforce",
			issuer: "https://idp.example.com",
			userId: "owner",
		};
		const update = vi.fn(async () => ({
			...provider,
			samlConfig: JSON.stringify(samlConfig("rotated-signing-certificate")),
		}));
		const context = {
			adapter: { update } as unknown as AuthContext["adapter"],
		} as AuthContext;

		await expect(
			lockSSOProviderForAccountLink(
				{ context },
				{ ...provider, samlConfig: samlConfig("original-signing-certificate") },
			),
		).rejects.toThrow(
			"SSO provider changed while account linking was in progress",
		);
	});
});
