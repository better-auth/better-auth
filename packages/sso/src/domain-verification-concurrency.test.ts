import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sso } from ".";
import { ssoClient } from "./client";

const dnsMock = vi.hoisted(() => ({
	resolveTxt: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
	...dnsMock,
	default: dnsMock,
}));

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

async function createDomainVerificationHarness() {
	const { auth, signInWithTestUser } = await getTestInstance(
		{
			plugins: [
				sso({
					domainVerification: { enabled: true },
				}),
			],
		},
		{
			clientOptions: {
				plugins: [
					ssoClient({
						domainVerification: { enabled: true },
					}),
				],
			},
		},
	);
	const { headers: sessionHeaders } = await signInWithTestUser();
	const request = (
		path: string,
		options: {
			method?: "GET" | "POST";
			body?: Record<string, unknown>;
		} = {},
	) => {
		const headers = new Headers(sessionHeaders);
		if (options.body) {
			headers.set("content-type", "application/json");
		}
		return auth.handler(
			new Request(`http://localhost:3000/api/auth${path}`, {
				method: options.method ?? "GET",
				headers,
				body: options.body ? JSON.stringify(options.body) : undefined,
			}),
		);
	};

	const registerProvider = async (
		providerId: string,
		domain: string,
		options: {
			audience?: string;
			issuer?: string;
		} = {},
	) => {
		const issuer = options.issuer ?? "https://idp.example";
		const response = await request("/sso/register", {
			method: "POST",
			body: {
				providerId,
				issuer,
				domain,
				samlConfig: {
					entryPoint: `${issuer}/sso`,
					cert: "test-certificate",
					callbackUrl: `http://localhost:3000/api/auth/sso/saml2/sp/acs/${providerId}`,
					audience: options.audience,
					idpMetadata: {
						entityID: issuer,
					},
					spMetadata: {},
				},
			},
		});
		expect(response.status).toBe(200);
		return (await response.json()) as {
			domain: string;
			domainVerificationToken: string;
			domainVerified: boolean;
			providerId: string;
			samlConfig: {
				audience?: string;
			};
		};
	};

	const getProvider = async (providerId: string) => {
		const response = await request(
			`/sso/get-provider?providerId=${providerId}`,
		);
		const provider =
			response.status === 200
				? ((await response.json()) as {
						domain: string;
						domainVerified: boolean;
						samlConfig: {
							audience?: string;
						};
					})
				: null;
		return { response, provider };
	};

	return { getProvider, registerProvider, request };
}

const staleProviderError = {
	code: "SSO_PROVIDER_CHANGED",
	message:
		"SSO provider changed while domain verification was in progress. Reload the provider and try again",
};

describe("domain verification concurrency", () => {
	afterEach(() => {
		dnsMock.resolveTxt.mockReset();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-8c5h-wx78-2cfg
	 */
	it("rejects a DNS proof after the provider domain changes", async () => {
		const { getProvider, registerProvider, request } =
			await createDomainVerificationHarness();
		const providerId = "domain-update-race";
		const attackerDomain = "attacker.example";
		const victimDomain = "victim.example";
		const provider = await registerProvider(providerId, attackerDomain);

		const dnsStarted = createDeferred<void>();
		const dnsCompletion = createDeferred<string[][]>();
		dnsMock.resolveTxt.mockImplementation(async () => {
			dnsStarted.resolve();
			return dnsCompletion.promise;
		});

		const verificationPromise = request("/sso/verify-domain", {
			method: "POST",
			body: { providerId },
		});
		await dnsStarted.promise;

		const updateResponse = await request("/sso/update-provider", {
			method: "POST",
			body: {
				providerId,
				domain: victimDomain,
			},
		});
		expect(updateResponse.status).toBe(200);

		dnsCompletion.resolve([[provider.domainVerificationToken]]);
		const verificationResponse = await verificationPromise;

		expect(verificationResponse.status).toBe(409);
		expect(await verificationResponse.json()).toEqual(staleProviderError);
		// The proof was collected for the domain held at request start, not the one
		// swapped in.
		expect(dnsMock.resolveTxt).toHaveBeenCalledWith(
			`_better-auth-token-${providerId}.${attackerDomain}`,
		);
		const { provider: persistedProvider } = await getProvider(providerId);
		expect(persistedProvider).toMatchObject({
			domain: victimDomain,
			domainVerified: false,
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-8c5h-wx78-2cfg
	 */
	it("keeps a later domain update unverified after verification completes", async () => {
		const { getProvider, registerProvider, request } =
			await createDomainVerificationHarness();
		const providerId = "verify-before-update";
		const originalDomain = "original.example";
		const changedDomain = "changed.example";
		const provider = await registerProvider(providerId, originalDomain);
		dnsMock.resolveTxt.mockResolvedValue([[provider.domainVerificationToken]]);

		const verificationResponse = await request("/sso/verify-domain", {
			method: "POST",
			body: { providerId },
		});
		expect(verificationResponse.status).toBe(204);

		const updateResponse = await request("/sso/update-provider", {
			method: "POST",
			body: {
				providerId,
				domain: changedDomain,
			},
		});
		expect(updateResponse.status).toBe(200);

		const { provider: persistedProvider } = await getProvider(providerId);
		expect(persistedProvider).toMatchObject({
			domain: changedDomain,
			domainVerified: false,
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-8c5h-wx78-2cfg
	 */
	it("rejects a DNS proof after the provider is deleted", async () => {
		const { getProvider, registerProvider, request } =
			await createDomainVerificationHarness();
		const providerId = "delete-race";
		const domain = "delete.example";
		const provider = await registerProvider(providerId, domain);

		const dnsStarted = createDeferred<void>();
		const dnsCompletion = createDeferred<string[][]>();
		dnsMock.resolveTxt.mockImplementation(async () => {
			dnsStarted.resolve();
			return dnsCompletion.promise;
		});

		const verificationPromise = request("/sso/verify-domain", {
			method: "POST",
			body: { providerId },
		});
		await dnsStarted.promise;

		const deleteResponse = await request("/sso/delete-provider", {
			method: "POST",
			body: { providerId },
		});
		expect(deleteResponse.status).toBe(200);

		dnsCompletion.resolve([[provider.domainVerificationToken]]);
		const verificationResponse = await verificationPromise;
		expect(verificationResponse.status).toBe(409);
		expect(await verificationResponse.json()).toEqual(staleProviderError);

		const { response: getProviderResponse } = await getProvider(providerId);
		expect(getProviderResponse.status).toBe(404);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-8c5h-wx78-2cfg
	 */
	it("does not apply an old proof to a replacement with the same provider ID", async () => {
		const { getProvider, registerProvider, request } =
			await createDomainVerificationHarness();
		const providerId = "replacement-race";
		const originalDomain = "original.example";
		const replacementDomain = "replacement.example";
		const originalProvider = await registerProvider(providerId, originalDomain);

		const dnsStarted = createDeferred<void>();
		const dnsCompletion = createDeferred<string[][]>();
		dnsMock.resolveTxt.mockImplementation(async () => {
			dnsStarted.resolve();
			return dnsCompletion.promise;
		});

		const verificationPromise = request("/sso/verify-domain", {
			method: "POST",
			body: { providerId },
		});
		await dnsStarted.promise;

		const deleteResponse = await request("/sso/delete-provider", {
			method: "POST",
			body: { providerId },
		});
		expect(deleteResponse.status).toBe(200);
		const replacement = await registerProvider(providerId, replacementDomain, {
			issuer: "https://replacement-idp.example",
		});
		expect(replacement.domainVerified).toBe(false);

		dnsCompletion.resolve([[originalProvider.domainVerificationToken]]);
		const verificationResponse = await verificationPromise;
		expect(verificationResponse.status).toBe(409);
		expect(await verificationResponse.json()).toEqual(staleProviderError);

		const { provider: persistedProvider } = await getProvider(providerId);
		expect(persistedProvider).toMatchObject({
			domain: replacementDomain,
			domainVerified: false,
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-8c5h-wx78-2cfg
	 */
	it("verifies the domain when two simultaneous requests prove the same domain", async () => {
		const { getProvider, registerProvider, request } =
			await createDomainVerificationHarness();
		const providerId = "simultaneous-verification";
		const domain = "simultaneous.example";
		const provider = await registerProvider(providerId, domain);

		let startedCount = 0;
		const bothStarted = createDeferred<void>();
		const dnsCompletion = createDeferred<string[][]>();
		dnsMock.resolveTxt.mockImplementation(async () => {
			startedCount += 1;
			if (startedCount === 2) {
				bothStarted.resolve();
			}
			return dnsCompletion.promise;
		});

		const firstVerification = request("/sso/verify-domain", {
			method: "POST",
			body: { providerId },
		});
		const secondVerification = request("/sso/verify-domain", {
			method: "POST",
			body: { providerId },
		});
		await bothStarted.promise;
		dnsCompletion.resolve([[provider.domainVerificationToken]]);

		// Both requests proved the domain that is still stored, so neither is
		// stale. Reporting a conflict here would tell a retrying client the
		// provider changed when nothing did.
		const responses = await Promise.all([
			firstVerification,
			secondVerification,
		]);
		expect(responses.map((response) => response.status)).toEqual([204, 204]);

		const { provider: persistedProvider } = await getProvider(providerId);
		expect(persistedProvider).toMatchObject({ domain, domainVerified: true });
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-8c5h-wx78-2cfg
	 */
	it("allows an unrelated provider update while DNS verification is in flight", async () => {
		const { getProvider, registerProvider, request } =
			await createDomainVerificationHarness();
		const providerId = "unrelated-update";
		const domain = "unchanged.example";
		const provider = await registerProvider(providerId, domain, {
			audience: "original-audience",
		});

		const dnsStarted = createDeferred<void>();
		const dnsCompletion = createDeferred<string[][]>();
		dnsMock.resolveTxt.mockImplementation(async () => {
			dnsStarted.resolve();
			return dnsCompletion.promise;
		});

		const verificationPromise = request("/sso/verify-domain", {
			method: "POST",
			body: { providerId },
		});
		await dnsStarted.promise;

		const updateResponse = await request("/sso/update-provider", {
			method: "POST",
			body: {
				providerId,
				samlConfig: {
					audience: "updated-audience",
				},
			},
		});
		expect(updateResponse.status).toBe(200);

		dnsCompletion.resolve([[provider.domainVerificationToken]]);
		const verificationResponse = await verificationPromise;
		expect(verificationResponse.status).toBe(204);

		const { provider: persistedProvider } = await getProvider(providerId);
		expect(persistedProvider).toMatchObject({
			domain,
			domainVerified: true,
			samlConfig: {
				audience: "updated-audience",
			},
		});
	});
});
