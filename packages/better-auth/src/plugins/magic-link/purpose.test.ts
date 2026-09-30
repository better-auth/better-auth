import type { SecondaryStorage } from "@better-auth/core/db";
import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oauthPopup } from "../oauth-popup";
import { magicLink } from ".";
import { magicLinkClient } from "./client";
import { defaultKeyHasher } from "./utils";

function createSecondaryStorage(): SecondaryStorage {
	const values = new Map<string, string>();
	return {
		set(key, value) {
			values.set(key, value);
		},
		get(key) {
			return values.get(key) ?? null;
		},
		getAndDelete(key) {
			const value = values.get(key) ?? null;
			values.delete(key);
			return value;
		},
		increment(key) {
			const count = Number(values.get(key) ?? 0) + 1;
			values.set(key, String(count));
			return count;
		},
		delete(key) {
			values.delete(key);
		},
	};
}

/**
 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-965c-763c-88jm
 */
describe("verification record purpose", () => {
	it.each([
		"database",
		"secondaryStorage",
	] as const)("rejects OAuth state when a custom hasher collapses purpose prefixes on %s", async (backend) => {
		let sentToken = "";
		const { auth, client, testUser } = await getTestInstance(
			{
				plugins: [
					magicLink({
						async sendMagicLink(data) {
							sentToken = data.token;
						},
					}),
				],
				verification: {
					storeIdentifier: {
						hash: async (identifier: string) =>
							identifier.replace(/^(magic-link:|auth-state:)/, ""),
					},
				},
				...(backend === "secondaryStorage"
					? { secondaryStorage: createSecondaryStorage() }
					: {}),
			},
			{ clientOptions: { plugins: [magicLinkClient()] } },
		);
		const signIn = await auth.api.signInSocial({
			body: {
				provider: "github",
				disableRedirect: true,
				additionalData: { type: "magic-link", email: testUser.email },
			},
		});
		if (!signIn.url) throw new Error("OAuth authorization URL missing");
		const state = new URL(signIn.url).searchParams.get("state");
		expect(state).toBeTruthy();

		const onError = vi.fn();
		await client.magicLink.verify(
			{ query: { token: state ?? "" } },
			{ onError },
		);
		expect(onError).toHaveBeenCalledOnce();
		expect(
			onError.mock.calls[0]?.[0].response.headers.get("location"),
		).toContain("error=INVALID_TOKEN");

		await client.signIn.magicLink({ email: testUser.email });
		expect(sentToken).not.toBe("");
		const result = await client.magicLink.verify({
			query: { token: sentToken },
		});
		expect(result.error).toBeNull();
		expect(result.data?.user.email).toBe(testUser.email);
		expect(result.data?.user.emailVerified).toBe(true);
	});

	it.each([
		["database", "global"],
		["secondaryStorage", "global"],
		["database", "overrides"],
		["secondaryStorage", "overrides"],
	] as const)("keeps OAuth state separate from Magic Link on %s with %s identifier storage", async (backend, strategy) => {
		let sentToken = "";
		const storeIdentifier =
			strategy === "global"
				? ("hashed" as const)
				: {
						default: "plain" as const,
						overrides: {
							"magic-link:": "hashed" as const,
							"auth-state:": "hashed" as const,
						},
					};
		const { auth, client, testUser } = await getTestInstance(
			{
				plugins: [
					magicLink({
						storeToken: "hashed",
						async sendMagicLink(data) {
							sentToken = data.token;
						},
					}),
				],
				verification: { storeIdentifier },
				...(backend === "secondaryStorage"
					? { secondaryStorage: createSecondaryStorage() }
					: {}),
			},
			{ clientOptions: { plugins: [magicLinkClient()] } },
		);

		const signIn = await auth.api.signInSocial({
			body: {
				provider: "github",
				disableRedirect: true,
				additionalData: { email: testUser.email },
			},
		});
		if (!signIn.url) throw new Error("OAuth authorization URL missing");
		const state = new URL(signIn.url).searchParams.get("state");
		expect(state).toBeTruthy();
		const adapter = (await auth.$context).internalAdapter;
		expect(
			await adapter.findVerificationValue(`auth-state:${state}`),
		).not.toBeNull();

		const onError = vi.fn();
		await client.magicLink.verify(
			{ query: { token: state ?? "" } },
			{ onError },
		);
		expect(onError).toHaveBeenCalledOnce();
		expect(
			onError.mock.calls[0]?.[0].response.headers.get("location"),
		).toContain("error=INVALID_TOKEN");
		expect(
			await adapter.findVerificationValue(`auth-state:${state}`),
		).not.toBeNull();
		for (const email of [
			testUser.email,
			`new-${backend.toLowerCase()}-${strategy}@test.com`,
		]) {
			await client.signIn.magicLink({ email });
			const storedToken = await defaultKeyHasher(sentToken);
			const record = await adapter.findVerificationValue(
				`magic-link:${storedToken}`,
			);
			expect(JSON.parse(record?.value ?? "null")).toMatchObject({
				type: "magic-link",
				email,
			});
			const result = await client.magicLink.verify({
				query: { token: sentToken },
			});
			expect(result.data?.user.email).toBe(email);
			expect(result.data?.user.emailVerified).toBe(true);
		}
	});

	it("rejects a namespaced record without Magic Link purpose", async () => {
		const { auth, client, testUser } = await getTestInstance(
			{
				plugins: [magicLink({ async sendMagicLink() {} })],
			},
			{ clientOptions: { plugins: [magicLinkClient()] } },
		);
		const adapter = (await auth.$context).internalAdapter;
		const token = "synthetic-wrong-purpose";
		await adapter.createVerificationValue({
			identifier: `magic-link:${token}`,
			value: JSON.stringify({ email: testUser.email }),
			expiresAt: new Date(Date.now() + 60_000),
		});

		const onError = vi.fn();
		await client.magicLink.verify({ query: { token } }, { onError });
		expect(onError).toHaveBeenCalledOnce();
		expect(
			onError.mock.calls[0]?.[0].response.headers.get("location"),
		).toContain("error=INVALID_TOKEN");
		expect(
			await adapter.findVerificationValue(`magic-link:${token}`),
		).toBeNull();
	});

	it.each([
		"plain",
		"hashed",
		"overrides",
	] as const)("does not redeem an unprefixed %s legacy record", async (mode) => {
		const hashed = mode !== "plain";
		const storeIdentifier =
			mode === "overrides"
				? {
						default: "plain" as const,
						overrides: { "magic-link:": "hashed" as const },
					}
				: mode;
		const { auth, client, testUser } = await getTestInstance(
			{
				verification: { storeIdentifier },
				plugins: [
					magicLink({
						storeToken: hashed ? "hashed" : "plain",
						async sendMagicLink() {},
					}),
				],
			},
			{ clientOptions: { plugins: [magicLinkClient()] } },
		);
		const adapter = (await auth.$context).internalAdapter;
		const token = "synthetic-legacy-record";
		const stored = hashed ? await defaultKeyHasher(token) : token;
		await adapter.createVerificationValue({
			identifier: stored,
			value: JSON.stringify({ email: testUser.email }),
			expiresAt: new Date(Date.now() + 60_000),
		});

		const onError = vi.fn();
		await client.magicLink.verify({ query: { token } }, { onError });
		expect(
			onError.mock.calls[0]?.[0].response.headers.get("location"),
		).toContain("error=INVALID_TOKEN");
		expect(await adapter.findVerificationValue(stored)).not.toBeNull();
	});

	it.each([
		"plain",
		"hashed",
		"custom",
	] as const)("keeps %s Magic Link sign-in and sign-up working with hashed identifiers", async (mode) => {
		let sentToken = "";
		const storeToken =
			mode === "custom"
				? {
						type: "custom-hasher" as const,
						async hash(token: string) {
							return `custom:${token}`;
						},
					}
				: mode;
		const { auth, client, testUser } = await getTestInstance(
			{
				verification: { storeIdentifier: "hashed" },
				plugins: [
					magicLink({
						storeToken,
						async sendMagicLink(data) {
							sentToken = data.token;
						},
					}),
				],
			},
			{ clientOptions: { plugins: [magicLinkClient()] } },
		);
		const adapter = (await auth.$context).internalAdapter;
		for (const email of [testUser.email, `new-${mode}@test.com`]) {
			await client.signIn.magicLink({ email });
			const stored =
				mode === "hashed"
					? await defaultKeyHasher(sentToken)
					: mode === "custom"
						? `custom:${sentToken}`
						: sentToken;
			const row = await adapter.findVerificationValue(`magic-link:${stored}`);
			expect(JSON.parse(row?.value ?? "null")).toMatchObject({
				type: "magic-link",
				email,
			});
			expect(await adapter.findVerificationValue(stored)).toBeNull();

			const verified = await client.magicLink.verify({
				query: { token: sentToken },
			});
			expect(verified.data?.user.email).toBe(email);
			expect(verified.data?.user.emailVerified).toBe(true);
		}
	});

	it("namespaces state created by social linking and popup start", async () => {
		const { auth, client, customFetchImpl, signInWithTestUser } =
			await getTestInstance(
				{
					plugins: [magicLink({ async sendMagicLink() {} }), oauthPopup()],
				},
				{ clientOptions: { plugins: [magicLinkClient()] } },
			);
		const adapter = (await auth.$context).internalAdapter;
		let linkURL = "";
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const link = await client.linkSocial({ provider: "github" });
			linkURL = link.data?.url ?? "";
		});
		const popup = await customFetchImpl(
			"http://localhost:3000/api/auth/oauth-popup/start?provider=github&popupOrigin=http%3A%2F%2Flocalhost%3A3000",
			{ method: "GET", redirect: "manual" },
		);
		expect(popup.status).toBe(302);

		for (const url of [linkURL, popup.headers.get("location") ?? ""]) {
			const state = new URL(url).searchParams.get("state");
			expect(state).toBeTruthy();
			expect(
				await adapter.findVerificationValue(`auth-state:${state}`),
			).not.toBeNull();
			const onError = vi.fn();
			await client.magicLink.verify(
				{ query: { token: state ?? "" } },
				{ onError },
			);
			expect(
				onError.mock.calls[0]?.[0].response.headers.get("location"),
			).toContain("error=INVALID_TOKEN");
		}
	});
});
