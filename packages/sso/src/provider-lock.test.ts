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
});
