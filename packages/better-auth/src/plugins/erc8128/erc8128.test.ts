import { createAuthEndpoint } from "@better-auth/core/api";
import type {
	CreateVerifierClientArgs,
	RoutePolicy,
	VerifyMessageFn,
	VerifyPolicy,
	VerifyResult,
} from "@slicekit/erc8128";
import { createVerifierClient, formatKeyId } from "@slicekit/erc8128";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { getTestInstance } from "../../test-utils/test-instance";
import { erc8128, getErc8128Api, getErc8128Verification } from "./index";
import { schema as erc8128Schema } from "./schema";
import type { WalletAddress } from "./types";
import {
	bytesToHex,
	getErc8128CacheKey,
	getErc8128InvalidationMatchKey,
	getErc8128SignatureHash,
	getErc8128SignatureInvalidationMatchKey,
} from "./utils";

vi.mock("@slicekit/erc8128", async () => {
	const actual =
		await vi.importActual<typeof import("@slicekit/erc8128")>(
			"@slicekit/erc8128",
		);

	return {
		...actual,
		createVerifierClient: vi.fn(),
	};
});

const defaultAddress = "0x000000000000000000000000000000000000dEaD" as const;
const defaultChainId = 1;

function okResult(args?: {
	address?: `0x${string}`;
	chainId?: number;
	created?: number;
	expires?: number;
	replayable?: boolean;
	keyId?: string;
}): VerifyResult {
	const address = args?.address ?? defaultAddress;
	const chainId = args?.chainId ?? defaultChainId;
	const keyId = args?.keyId ?? formatKeyId(chainId, address);
	const created = args?.created ?? Math.floor(Date.now() / 1000);
	const expires = args?.expires ?? created + 300;

	return {
		ok: true,
		address,
		chainId,
		label: "eth",
		components: ["@method", "@target-uri", "@authority"],
		params: {
			created,
			expires,
			keyid: keyId,
		},
		replayable: args?.replayable ?? false,
		binding: "class-bound",
	};
}

function failResult(
	reason: Extract<VerifyResult, { ok: false }>["reason"],
): VerifyResult {
	return {
		ok: false,
		reason,
	};
}

async function flushAsyncWork(ticks = 5) {
	for (let index = 0; index < ticks; index += 1) {
		await Promise.resolve();
	}
}

function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((resolver) => {
		resolve = () => resolver();
	});
	return { promise, resolve };
}

function mockVerifier(
	fn: (args: {
		request: Request;
		policy?: VerifyPolicy;
		setHeaders?: (name: string, value: string) => void;
	}) => Promise<VerifyResult>,
) {
	vi.mocked(createVerifierClient).mockImplementation(() => ({
		verifyRequest: vi.fn(fn),
	}));
}

interface TestAuth {
	handler: (request: Request) => Promise<Response>;
}

async function post(
	auth: TestAuth,
	path: string,
	init?: { headers?: HeadersInit; body?: Record<string, unknown> },
) {
	const response = await auth.handler(
		new Request(`http://localhost:3000/api/auth${path}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(init?.headers ?? {}),
			},
			body: JSON.stringify(init?.body ?? {}),
		}),
	);
	const data = await response.json();
	return { response, data };
}

async function postRaw(
	auth: TestAuth,
	path: string,
	init: { headers?: HeadersInit; body: string },
) {
	const response = await auth.handler(
		new Request(`http://localhost:3000/api/auth${path}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(init.headers ?? {}),
			},
			body: init.body,
		}),
	);
	const data = await response.json();
	return { response, data };
}

async function get(
	auth: TestAuth,
	path: string,
	init?: { headers?: HeadersInit },
) {
	const response = await auth.handler(
		new Request(`http://localhost:3000/api/auth${path}`, {
			method: "GET",
			headers: init?.headers,
		}),
	);
	const data = await response.json();
	return { response, data };
}

function cookieFromSetCookie(setCookie: string | null) {
	if (!setCookie) return "";
	return setCookie.split(";")[0] ?? "";
}

function createMockSecondaryStorage() {
	const store = new Map<string, { value: string; expiresAt: number }>();
	const getEntry = (key: string) => {
		const entry = store.get(key);
		if (!entry) return null;
		if (entry.expiresAt <= Date.now()) {
			store.delete(key);
			return null;
		}
		return entry;
	};
	const get = vi.fn(async (key: string) => {
		const entry = getEntry(key);
		if (!entry) return null;
		return entry.value;
	});
	const getMany = vi.fn(async (keys: string[]) =>
		keys.map((key) => getEntry(key)?.value ?? null),
	);
	const setIfNotExists = vi.fn(
		async (key: string, value: string, ttl?: number): Promise<boolean> => {
			if (getEntry(key)) {
				return false;
			}
			store.set(key, {
				value,
				expiresAt: Date.now() + (ttl ?? 3600) * 1000,
			});
			return true;
		},
	);
	const set = vi.fn(async (key: string, value: string, ttl?: number) => {
		store.set(key, {
			value,
			expiresAt: Date.now() + (ttl ?? 3600) * 1000,
		});
	});
	const del = vi.fn(async (key: string) => {
		store.delete(key);
	});

	return {
		store,
		get,
		getMany,
		set,
		setIfNotExists,
		delete: del,
		storage: {
			get,
			getMany,
			set,
			setIfNotExists,
			delete: del,
		},
	};
}

function getReplayableSignatureParamsValue(args: {
	keyId: string;
	created: number;
	expires: number;
}) {
	return `("@method" "@target-uri" "@authority");keyid="${args.keyId}";created=${args.created};expires=${args.expires}`;
}

function getReplayableSignatureInputHeader(args: {
	keyId: string;
	created: number;
	expires: number;
}) {
	return `sig=${getReplayableSignatureParamsValue(args)}`;
}

function getReplayableMessageRaw(path: string, signatureParamsValue: string) {
	const url = new URL(`http://localhost:3000/api/auth${path}`);
	const signatureBase = [
		'"@method": GET',
		`"@target-uri": ${url.toString()}`,
		`"@authority": ${url.host}`,
		`"@signature-params": ${signatureParamsValue}`,
	].join("\n");
	return bytesToHex(new TextEncoder().encode(signatureBase));
}

describe("erc8128 plugin", () => {
	it("always registers full schema including invalidation table", () => {
		const base = erc8128({ verifyMessage: async () => true });
		expect(base.schema).toEqual(erc8128Schema);
		expect(base.schema.erc8128Nonce).toBeDefined();
		expect(base.schema.erc8128VerificationCache).toBeDefined();
		expect(base.schema.erc8128Invalidation).toBeDefined();

		const replayable = erc8128({
			verifyMessage: async () => true,
			routePolicy: { default: { replayable: true } },
		});
		expect(replayable.schema).toEqual(erc8128Schema);
	});

	describe("GET /.well-known/erc8128", () => {
		it("returns discovery metadata", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						maxValiditySec: 120,
						clockSkewSec: 15,
					}),
				],
			});

			const { response, data } = await get(auth, "/.well-known/erc8128");
			expect(response.status).toBe(200);
			expect(data).toMatchObject({
				verification_endpoint: "http://localhost:3000/api/auth/erc8128/verify",
				max_validity_sec: 120,
			});
			expect(data.invalidation_endpoint).toBeUndefined();
		});

		it("omits persistent endpoints in stateless mode and warns once", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			try {
				const { auth } = await getTestInstance({
					database: undefined as any,
					plugins: [
						erc8128({
							verifyMessage: async () => true,
							routePolicy: {
								default: { replayable: true },
							},
						}),
					],
				});

				const { response, data } = await get(auth, "/.well-known/erc8128");
				expect(response.status).toBe(200);
				expect(data.verification_endpoint).toBeUndefined();
				expect(data.invalidation_endpoint).toBeUndefined();
				expect(warnSpy).toHaveBeenCalledWith(
					expect.stringContaining("No persistent storage available"),
				);
			} finally {
				warnSpy.mockRestore();
			}
		});

		it("includes invalidation endpoint when replayable signatures are enabled", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: {
							default: { replayable: true },
						},
					}),
				],
			});

			const { response, data } = await get(auth, "/.well-known/erc8128");
			expect(response.status).toBe(200);
			expect(data.invalidation_endpoint).toBe(
				"http://localhost:3000/api/auth/erc8128/invalidate",
			);
		});

		it("includes route_policies when routePolicy is configured and omits false entries", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: {
							"/products/*": {
								methods: ["GET"],
								replayable: true,
							},
							"/orders": { methods: ["POST"], replayable: false },
							"/public/*": false,
							default: { replayable: false },
						},
					}),
				],
			});

			const { response, data } = await get(auth, "/.well-known/erc8128");
			expect(response.status).toBe(200);
			expect(data.route_policies).toEqual({
				"/products/*": { methods: ["GET"], replayable: true },
				"/orders": { methods: ["POST"], replayable: false },
				default: { replayable: false },
			});
		});
	});

	describe("POST /erc8128/verify", () => {
		it("returns 404 in stateless mode without persistent storage", async () => {
			const { auth } = await getTestInstance({
				database: undefined as any,
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			const response = await auth.handler(
				new Request("http://localhost:3000/api/auth/erc8128/verify", {
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: "{}",
				}),
			);

			expect(response.status).toBe(404);
		});

		it("creates user + walletAddress + account + session and sets cookie for valid signature", async () => {
			mockVerifier(async () => okResult());
			const { auth } = await getTestInstance({
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			const { response, data } = await post(auth, "/erc8128/verify");
			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.token).toBeDefined();
			expect(response.headers.get("set-cookie")).toContain(
				"better-auth.session_token=",
			);

			const ctx = await auth.$context;
			const users = await ctx.adapter.findMany({ model: "user" });
			const walletAddresses = await ctx.adapter.findMany<WalletAddress>({
				model: "walletAddress",
				where: [{ field: "address", operator: "eq", value: defaultAddress }],
			});
			const accounts = await ctx.adapter.findMany<{ providerId: string }>({
				model: "account",
			});
			const sessions = await ctx.adapter.findMany({ model: "session" });

			expect(users.length).toBe(2); // default test user + new wallet user
			expect(walletAddresses).toHaveLength(1);
			expect(accounts.some((a) => a.providerId === "erc8128")).toBe(true);
			expect(sessions.length).toBeGreaterThan(0);
		});

		it("verifies /erc8128/verify against the original request body bytes", async () => {
			let seenBody = "";
			mockVerifier(async ({ request }) => {
				seenBody = await request.text();
				return okResult();
			});
			const { auth } = await getTestInstance({
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			const rawBody = '{  "email" : "alice@example.com"  }';
			const { response } = await postRaw(auth, "/erc8128/verify", {
				body: rawBody,
			});

			expect(response.status).toBe(200);
			expect(seenBody).toBe(rawBody);
		});

		it("reuses existing user for same address+chain and does not duplicate user", async () => {
			mockVerifier(async () => okResult());
			const { auth } = await getTestInstance({
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			const first = await post(auth, "/erc8128/verify");
			const second = await post(auth, "/erc8128/verify");
			expect(first.response.status).toBe(200);
			expect(second.response.status).toBe(200);
			expect(second.data.user.id).toBe(first.data.user.id);

			const ctx = await auth.$context;
			const walletAddresses = await ctx.adapter.findMany({
				model: "walletAddress",
				where: [
					{ field: "address", operator: "eq", value: defaultAddress },
					{ field: "chainId", operator: "eq", value: defaultChainId },
				],
			});
			expect(walletAddresses).toHaveLength(1);
		});

		it("links same address on different chain to existing user and adds walletAddress record", async () => {
			let call = 0;
			mockVerifier(async () => {
				call += 1;
				return call === 1
					? okResult({ chainId: 1 })
					: okResult({ chainId: 137, keyId: formatKeyId(137, defaultAddress) });
			});
			const { auth } = await getTestInstance({
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			const eth = await post(auth, "/erc8128/verify");
			const polygon = await post(auth, "/erc8128/verify");
			expect(eth.data.user.id).toBe(polygon.data.user.id);

			const ctx = await auth.$context;
			const walletAddresses = await ctx.adapter.findMany<WalletAddress>({
				model: "walletAddress",
				where: [{ field: "address", operator: "eq", value: defaultAddress }],
			});
			expect(walletAddresses).toHaveLength(2);
			expect(walletAddresses.find((w) => w.chainId === 1)?.isPrimary).toBe(
				true,
			);
			expect(walletAddresses.find((w) => w.chainId === 137)?.isPrimary).toBe(
				false,
			);
		});

		it("returns structured 401 with Accept-Signature for invalid/expired/tampered signature", async () => {
			mockVerifier(async ({ setHeaders }) => {
				setHeaders?.(
					"Accept-Signature",
					'sig=("@method" "@target-uri");alg="eip191"',
				);
				return failResult("bad_signature");
			});
			const { auth } = await getTestInstance({
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			const { response, data } = await post(auth, "/erc8128/verify");
			expect(response.status).toBe(401);
			expect(response.headers.get("accept-signature")).toContain("@method");
			expect(data).toMatchObject({
				error: "erc8128_verification_failed",
				reason: "bad_signature",
			});
		});

		it("returns 401 for replayed nonce", async () => {
			let call = 0;
			mockVerifier(async () => {
				call += 1;
				return call === 1 ? okResult() : failResult("replay");
			});
			const { auth } = await getTestInstance({
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			const first = await post(auth, "/erc8128/verify");
			const second = await post(auth, "/erc8128/verify");
			expect(first.response.status).toBe(200);
			expect(second.response.status).toBe(401);
		});

		it("rejects class-bound signatures even when non-replayable", async () => {
			mockVerifier(async () => failResult("not_request_bound"));
			const { auth } = await getTestInstance({
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			const { response, data } = await post(auth, "/erc8128/verify");
			expect(response.status).toBe(401);
			expect(data).toMatchObject({
				error: "erc8128_verification_failed",
				reason: "not_request_bound",
			});
		});

		it("rejects replayable signatures even when request-bound", async () => {
			mockVerifier(async () => failResult("replayable_not_allowed"));
			const { auth } = await getTestInstance({
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			const { response, data } = await post(auth, "/erc8128/verify");
			expect(response.status).toBe(401);
			expect(data).toMatchObject({
				error: "erc8128_verification_failed",
				reason: "replayable_not_allowed",
			});
		});

		it("accepts request-bound non-replayable signatures", async () => {
			mockVerifier(async () => okResult({ replayable: false }));
			const { auth } = await getTestInstance({
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			const { response, data } = await post(auth, "/erc8128/verify");
			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});

		it("strictly rejects expired signatures on /erc8128/verify", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:10.000Z"));

			try {
				mockVerifier(async () =>
					okResult({
						created: Math.floor(Date.now() / 1000) - 20,
						expires: Math.floor(Date.now() / 1000),
						replayable: false,
					}),
				);
				const { auth } = await getTestInstance({
					plugins: [
						erc8128({
							verifyMessage: async () => true,
							clockSkewSec: 30,
						}),
					],
				});

				const { response, data } = await post(auth, "/erc8128/verify");
				expect(response.status).toBe(401);
				expect(data).toMatchObject({
					error: "erc8128_verification_failed",
					reason: "expired",
				});
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe("downstream verification context", () => {
		it("exposes the verified ERC-8128 result to custom Better Auth endpoints", async () => {
			mockVerifier(async () => okResult({ replayable: false }));

			const endpointPlugin = {
				id: "erc8128-test-endpoint",
				endpoints: {
					readVerifiedSignature: createAuthEndpoint(
						"/custom/signed",
						{
							method: "POST",
							body: z.object({
								value: z.string(),
							}),
							cloneRequest: true,
						},
						async (ctx) => {
							const verification = getErc8128Verification(ctx);
							return ctx.json({
								value: ctx.body.value,
								verification,
							});
						},
					),
				},
			};

			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: {
							"/custom/signed": {
								methods: ["POST"],
								replayable: false,
							},
						},
					}),
					endpointPlugin,
				],
			});

			const response = await auth.handler(
				new Request("http://localhost:3000/api/auth/custom/signed", {
					method: "POST",
					headers: {
						"content-type": "application/json",
						signature: "sig1=:bW9jaw==:",
						"signature-input": `sig1=("@method" "@target-uri" "@authority");created=1;expires=301;keyid="${formatKeyId(defaultChainId, defaultAddress)}";nonce="nonce-1"`,
					},
					body: JSON.stringify({ value: "ok" }),
				}),
			);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.value).toBe("ok");
			expect(data.verification).toMatchObject({
				ok: true,
				address: defaultAddress,
				chainId: defaultChainId,
				replayable: false,
			});
		});
	});

	describe("auth.api.erc8128", () => {
		it("protects arbitrary app requests without routing them through auth.handler", async () => {
			mockVerifier(async ({ request, policy }) => {
				expect(new URL(request.url).pathname).toBe("/app/feed");
				expect(policy).toMatchObject({
					methods: ["GET"],
					replayable: false,
				});
				return okResult({ replayable: false });
			});

			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: {
							"/app/feed": {
								methods: ["GET"],
								replayable: false,
							},
						},
					}),
				],
			});

			const result = await auth.api.erc8128.protect(
				new Request("http://localhost:3000/app/feed", {
					method: "GET",
					headers: {
						signature: "sig-app-feed",
						"signature-input": 'sig=("@method" "@target-uri" "@authority")',
					},
				}),
			);

			expect(result.ok).toBe(true);
			if (!result.ok) {
				return;
			}

			expect(result.protected).toBe(true);
			expect(result.authenticated).toBe(true);
			expect(result.source).toBe("signature");
			expect(result.verification).toMatchObject({
				ok: true,
				address: defaultAddress,
				chainId: defaultChainId,
			});
			expect(result.principal?.session.token).toContain("erc8128:");
			expect(result.principal?.user.id).toBeDefined();
		});

		it("returns a 401 response for protected arbitrary routes without a signature", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: {
							"/app/feed": {
								methods: ["GET"],
								replayable: false,
							},
						},
					}),
				],
			});

			const result = await auth.api.erc8128.protect(
				new Request("http://localhost:3000/app/feed", {
					method: "GET",
				}),
			);

			expect(result.ok).toBe(false);
			if (result.ok) {
				return;
			}

			expect(result.response.status).toBe(401);
			await expect(result.response.json()).resolves.toMatchObject({
				error: "erc8128_verification_failed",
				reason: "missing_signature",
			});
		});
	});

	describe("hooks.before", () => {
		it("middleware verifies signature, authenticates the request, and does not set a session cookie", async () => {
			mockVerifier(async () => okResult());
			const { auth } = await getTestInstance({
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			const ctx = await auth.$context;

			const { data, response } = await get(auth, "/get-session", {
				headers: {
					signature: "sig-valid-hook",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
				},
			});
			expect(response.status).toBe(200);
			expect(data.session).toBeDefined();
			expect(data.session.token).toContain("erc8128:");
			expect(data.user).toBeDefined();
			expect(response.headers.get("set-cookie")).toBeNull();

			// But user + wallet were created
			const wallets = await ctx.adapter.findMany<WalletAddress>({
				model: "walletAddress",
				where: [{ field: "address", operator: "eq", value: defaultAddress }],
			});
			expect(wallets).toHaveLength(1);
		});

		it("middleware creates user + wallet on first signed request without prior /verify", async () => {
			mockVerifier(async () => okResult());
			const { auth } = await getTestInstance({
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			const ctx = await auth.$context;

			// No users other than the default test user
			const usersBefore = await ctx.adapter.findMany({ model: "user" });
			const walletsBefore = await ctx.adapter.findMany({
				model: "walletAddress",
			});
			expect(usersBefore).toHaveLength(1); // default test user
			expect(walletsBefore).toHaveLength(0);

			// Signed request to middleware — should auto-create user + wallet and
			// expose a request-scoped authenticated identity.
			const { data, response } = await get(auth, "/get-session", {
				headers: {
					signature: "sig-first",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
				},
			});
			expect(response.status).toBe(200);
			expect(data.session).toBeDefined();
			expect(data.session.token).toContain("erc8128:");
			expect(data.user).toBeDefined();
			expect(response.headers.get("set-cookie")).toBeNull();

			const usersAfter = await ctx.adapter.findMany({ model: "user" });
			const walletsAfter = await ctx.adapter.findMany<WalletAddress>({
				model: "walletAddress",
				where: [{ field: "address", operator: "eq", value: defaultAddress }],
			});
			const accounts = await ctx.adapter.findMany<{ providerId: string }>({
				model: "account",
				where: [{ field: "providerId", operator: "eq", value: "erc8128" }],
			});

			expect(usersAfter).toHaveLength(2); // default test user + new wallet user
			expect(walletsAfter).toHaveLength(1);
			expect(walletsAfter[0]?.isPrimary).toBe(true);
			expect(accounts).toHaveLength(1);
		});

		it("rejects protected per-request auth when the wallet is unlinked and anonymous onboarding is disabled", async () => {
			mockVerifier(async () => okResult({ replayable: false }));
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						anonymous: false,
						routePolicy: {
							"/get-session": {
								methods: ["GET"],
								replayable: false,
							},
						},
					}),
				],
			});

			const { response, data } = await get(auth, "/get-session", {
				headers: {
					signature: "sig-unlinked-wallet",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
				},
			});

			expect(response.status).toBe(401);
			expect(data).toMatchObject({
				error: "erc8128_verification_failed",
				reason: "wallet_not_linked",
			});
		});

		it("middleware links same address on different chain to existing user", async () => {
			let call = 0;
			mockVerifier(async () => {
				call += 1;
				return call === 1
					? okResult({ chainId: 1 })
					: okResult({ chainId: 137, keyId: formatKeyId(137, defaultAddress) });
			});

			const { auth } = await getTestInstance({
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			const ctx = await auth.$context;

			// First signed request — creates user on chain 1
			await get(auth, "/get-session", {
				headers: {
					signature: "sig-chain1",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
				},
			});

			// Second signed request — same address, different chain
			await get(auth, "/get-session", {
				headers: {
					signature: "sig-chain137",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
				},
			});

			const wallets = await ctx.adapter.findMany<WalletAddress>({
				model: "walletAddress",
				where: [{ field: "address", operator: "eq", value: defaultAddress }],
			});
			expect(wallets).toHaveLength(2);
			expect(wallets.find((w) => w.chainId === 1)?.isPrimary).toBe(true);
			expect(wallets.find((w) => w.chainId === 137)?.isPrimary).toBe(false);

			// Same user for both
			expect(wallets[0]?.userId).toBe(wallets[1]?.userId);
		});

		it("middleware with anonymous: false rejects unknown wallets when it cannot create a user", async () => {
			mockVerifier(async () => okResult());
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						anonymous: false,
					}),
				],
			});

			const ctx = await auth.$context;

			// Middleware can't provide an email, so findOrCreateWalletUser returns null
			const { data, response } = await get(auth, "/get-session", {
				headers: {
					signature: "sig-anon",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
				},
			});
			expect(response.status).toBe(401);
			expect(data).toMatchObject({
				error: "erc8128_verification_failed",
				reason: "wallet_not_linked",
			});

			// No wallet created
			const wallets = await ctx.adapter.findMany({
				model: "walletAddress",
				where: [{ field: "address", operator: "eq", value: defaultAddress }],
			});
			expect(wallets).toHaveLength(0);
		});

		it("request without signature headers passes through without interference", async () => {
			mockVerifier(async () => okResult());
			const { auth } = await getTestInstance({
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			const { data, response } = await get(auth, "/get-session");
			expect(response.status).toBe(200);
			expect(
				data === null || (data.session === null && data.user === null),
			).toBe(true);
		});

		it("invalid signature passes through and falls back to session cookie", async () => {
			let call = 0;
			mockVerifier(async () => {
				call += 1;
				return call === 1 ? okResult() : failResult("bad_signature");
			});
			const { auth } = await getTestInstance({
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			const verified = await post(auth, "/erc8128/verify");
			const cookie = cookieFromSetCookie(
				verified.response.headers.get("set-cookie"),
			);
			const { data, response } = await get(auth, "/get-session", {
				headers: {
					signature: "bad-sig",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
					cookie,
				},
			});
			expect(response.status).toBe(200);
			expect(data.session).toBeDefined();
			expect(data.user).toBeDefined();
		});

		it("routePolicy exact match requires auth and returns structured 401 + Accept-Signature on failure", async () => {
			mockVerifier(async ({ request, setHeaders }) => {
				if (request.url.endsWith("/verify")) {
					return okResult();
				}
				setHeaders?.(
					"Accept-Signature",
					'sig=("@method" "@target-uri");alg="eip191"',
				);
				return failResult("expired");
			});

			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: {
							"/get-session": {
								methods: ["GET"],
								replayable: false,
							},
						},
					}),
				],
			});

			const { response, data } = await get(auth, "/get-session", {
				headers: {
					signature: "bad-sig",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
				},
			});
			expect(response.status).toBe(401);
			expect(response.headers.get("accept-signature")).toContain("@method");
			expect(data).toMatchObject({
				error: "erc8128_verification_failed",
				reason: "expired",
			});
		});

		it("strictly rejects middleware signatures once now reaches expires", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:10.000Z"));

			try {
				mockVerifier(async () =>
					okResult({
						created: Math.floor(Date.now() / 1000) - 20,
						expires: Math.floor(Date.now() / 1000),
						replayable: true,
					}),
				);
				const { auth } = await getTestInstance({
					plugins: [
						erc8128({
							verifyMessage: async () => true,
							clockSkewSec: 30,
							routePolicy: {
								"/get-session": {
									methods: ["GET"],
									replayable: true,
								},
							},
						}),
					],
				});

				const { response, data } = await get(auth, "/get-session", {
					headers: {
						signature: "sig-expired-strict",
						"signature-input": 'sig=("@method" "@target-uri" "@authority")',
					},
				});
				expect(response.status).toBe(401);
				expect(data).toMatchObject({
					error: "erc8128_verification_failed",
					reason: "expired",
				});
			} finally {
				vi.useRealTimers();
			}
		});

		it("routePolicy exact match passes through on valid signature", async () => {
			mockVerifier(async () => okResult());
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: {
							"/get-session": {
								methods: ["GET"],
								replayable: false,
							},
						},
					}),
				],
			});

			// Valid signature — middleware verifies and allows through (no session created)
			const { response } = await get(auth, "/get-session", {
				headers: {
					signature: "sig-ok",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
				},
			});
			expect(response.status).toBe(200);
		});

		it("does not probe the nonce table to resolve database storage mode", async () => {
			mockVerifier(async () => okResult());
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: {
							"/get-session": {
								methods: ["GET"],
								replayable: false,
							},
						},
					}),
				],
			});

			const ctx = await auth.$context;
			const findManySpy = vi.spyOn(ctx.adapter, "findMany");

			const { response } = await get(auth, "/get-session", {
				headers: {
					signature: "sig-ok-no-storage-probe",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
				},
			});

			expect(response.status).toBe(200);
			expect(findManySpy).not.toHaveBeenCalledWith({
				model: "erc8128Nonce",
				limit: 1,
			});
		});

		it("routePolicy wildcard + false skips verification entirely", async () => {
			const verifySpy = vi.fn(async () => okResult());
			vi.mocked(createVerifierClient).mockImplementation(() => ({
				verifyRequest: verifySpy,
			}));

			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: {
							"/*": false,
						},
					}),
				],
			});

			const { response } = await get(auth, "/get-session", {
				headers: {
					signature: "sig-skip",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
				},
			});
			expect(response.status).toBe(200);
			expect(verifySpy).not.toHaveBeenCalled();
		});

		it("routePolicy default requires auth for unmatched routes", async () => {
			mockVerifier(async () => failResult("not_request_bound"));
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: {
							default: { replayable: false },
						},
					}),
				],
			});

			const { response, data } = await get(auth, "/get-session", {
				headers: {
					signature: "sig-fail",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
				},
			});
			expect(response.status).toBe(401);
			expect(data).toMatchObject({
				error: "erc8128_verification_failed",
				reason: "not_request_bound",
			});
		});

		it("getErc8128Api.verifyRequest resolves routePolicy when policy is omitted", async () => {
			const verifySpy = vi.fn(async ({ policy }: { policy?: RoutePolicy }) => {
				expect(policy).toEqual({
					methods: ["GET"],
					replayable: false,
				});
				return okResult({ replayable: false });
			});
			vi.mocked(createVerifierClient).mockImplementation(() => ({
				verifyRequest: verifySpy,
			}));

			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: {
							"/get-session": {
								methods: ["GET"],
								replayable: false,
							},
						},
					}),
				],
			});

			const result = await getErc8128Api(auth).verifyRequest(
				new Request("http://localhost:3000/api/auth/get-session", {
					method: "GET",
					headers: {
						signature: "sig-api-policy",
						"signature-input": 'sig=("@method" "@target-uri" "@authority")',
					},
				}),
			);

			expect(result.ok).toBe(true);
			expect(verifySpy).toHaveBeenCalledTimes(1);
		});

		it("session-first (default): skips signature verification when session cookie is present", async () => {
			const verifySpy = vi.fn(async () => okResult());
			vi.mocked(createVerifierClient).mockImplementation(() => ({
				verifyRequest: verifySpy,
			}));
			const { auth } = await getTestInstance({
				plugins: [erc8128({ verifyMessage: async () => true })],
			});

			// Create a session via /verify
			const verified = await post(auth, "/erc8128/verify");
			const cookie = cookieFromSetCookie(
				verified.response.headers.get("set-cookie"),
			);

			verifySpy.mockClear();

			// Request with both cookie and signature headers — session-first should skip verification
			const { response, data } = await get(auth, "/get-session", {
				headers: {
					signature: "sig-skipped",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
					cookie,
				},
			});
			expect(response.status).toBe(200);
			expect(data.session).toBeDefined();
			expect(verifySpy).not.toHaveBeenCalled();
		});

		it("session-first does not skip routePolicy enforcement for substring cookie name matches", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: {
							"/get-session": {
								methods: ["GET"],
								replayable: false,
							},
						},
					}),
				],
			});

			const ctx = await auth.$context;
			const sessionCookieName = ctx.authCookies.sessionToken.name;

			const { response, data } = await get(auth, "/get-session", {
				headers: {
					cookie: `${sessionCookieName}_shadow=1`,
				},
			});

			expect(response.status).toBe(401);
			expect(data).toMatchObject({
				error: "erc8128_verification_failed",
				reason: "missing_signature",
			});
		});

		it("signature-first: verifies signature even when session cookie is present", async () => {
			mockVerifier(async () => okResult());
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						authPrecedence: "signature-first",
					}),
				],
			});

			// Create a session via /verify
			const verified = await post(auth, "/erc8128/verify");
			const cookie = cookieFromSetCookie(
				verified.response.headers.get("set-cookie"),
			);
			const cookieSessionToken = verified.data.token as string;

			const verifySpy = vi.fn(async () => okResult());
			vi.mocked(createVerifierClient).mockImplementation(() => ({
				verifyRequest: verifySpy,
			}));

			// Request with both cookie and signature headers — should still verify
			const { response, data } = await get(auth, "/get-session", {
				headers: {
					signature: "sig-verified",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
					cookie,
				},
			});
			expect(response.status).toBe(200);
			expect(verifySpy).toHaveBeenCalled();
			expect(data.session.token).toContain("erc8128:");
			expect(data.session.token).not.toBe(cookieSessionToken);
		});

		it("reject-on-mismatch: passes when session and signature resolve to the same user", async () => {
			mockVerifier(async () => okResult());
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						authPrecedence: "reject-on-mismatch",
					}),
				],
			});

			// Create a session via /verify (user created from defaultAddress)
			const verified = await post(auth, "/erc8128/verify");
			const cookie = cookieFromSetCookie(
				verified.response.headers.get("set-cookie"),
			);
			expect(verified.response.status).toBe(200);

			// Request with cookie + same wallet signature — should pass
			const { response, data } = await get(auth, "/get-session", {
				headers: {
					signature: "sig-same",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
					cookie,
				},
			});
			expect(response.status).toBe(200);
			expect(data.session).toBeDefined();
		});

		it("reject-on-mismatch: returns 401 when session and signature resolve to different users", async () => {
			const otherAddress =
				"0x0000000000000000000000000000000000001234" as const;
			let call = 0;
			mockVerifier(async () => {
				call += 1;
				// First call: /verify creates session for defaultAddress
				if (call === 1) return okResult();
				// Second call: middleware verifies as otherAddress
				return okResult({
					address: otherAddress,
					keyId: formatKeyId(defaultChainId, otherAddress),
				});
			});

			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						authPrecedence: "reject-on-mismatch",
					}),
				],
			});

			// Create session for defaultAddress
			const verified = await post(auth, "/erc8128/verify");
			const cookie = cookieFromSetCookie(
				verified.response.headers.get("set-cookie"),
			);
			expect(verified.response.status).toBe(200);

			// Request with cookie (defaultAddress user) + signature (otherAddress) — mismatch
			const { response, data } = await get(auth, "/get-session", {
				headers: {
					signature: "sig-different",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
					cookie,
				},
			});
			expect(response.status).toBe(401);
			expect(data).toMatchObject({
				error: "erc8128_verification_failed",
				reason: "identity_mismatch",
			});
		});

		it("reject-on-mismatch resolves session in parallel with signature verification", async () => {
			const sessionGate = createDeferred();
			const verifyGate = createDeferred();
			const events: string[] = [];

			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						authPrecedence: "reject-on-mismatch",
					}),
				],
			});

			const verified = await post(auth, "/erc8128/verify");
			const cookie = cookieFromSetCookie(
				verified.response.headers.get("set-cookie"),
			);

			vi.mocked(createVerifierClient).mockImplementation(() => ({
				verifyRequest: vi.fn(async () => {
					events.push("verify-start");
					await verifyGate.promise;
					events.push("verify-end");
					return okResult();
				}),
			}));

			const protectPromise = auth.api.erc8128.protect(
				new Request("http://localhost:3000/get-session", {
					method: "GET",
					headers: {
						signature: "sig-parallel",
						"signature-input": 'sig=("@method" "@target-uri" "@authority")',
						cookie,
					},
				}),
				{
					resolveSession: async () => {
						events.push("session-start");
						await sessionGate.promise;
						events.push("session-end");
						return null;
					},
				},
			);

			for (
				let index = 0;
				index < 20 && !events.includes("verify-start");
				index += 1
			) {
				await flushAsyncWork(5);
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
			expect(events).toContain("session-start");
			expect(events).toContain("verify-start");

			verifyGate.resolve();
			sessionGate.resolve();

			const result = await protectPromise;
			expect(result.ok).toBe(true);
		});

		it("unmatched route without routePolicy.default uses opportunistic fallthrough", async () => {
			mockVerifier(async ({ request }) => {
				if (request.url.endsWith("/verify")) {
					return okResult();
				}
				return failResult("bad_signature");
			});
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: {
							"/erc8128/verify": {
								methods: ["POST"],
								replayable: false,
							},
						},
					}),
				],
			});

			const verified = await post(auth, "/erc8128/verify");
			const cookie = cookieFromSetCookie(
				verified.response.headers.get("set-cookie"),
			);
			const { response, data } = await get(auth, "/get-session", {
				headers: {
					signature: "sig-bad",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
					cookie,
				},
			});
			expect(response.status).toBe(200);
			expect(data.session).toBeDefined();
			expect(data.user).toBeDefined();
		});
	});

	describe("POST /erc8128/invalidate", () => {
		it("returns 404 in stateless mode without persistent storage", async () => {
			const { auth } = await getTestInstance({
				database: undefined as any,
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const response = await auth.handler(
				new Request("http://localhost:3000/api/auth/erc8128/invalidate", {
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: "{}",
				}),
			);

			expect(response.status).toBe(404);
		});

		it("valid non-replayable request sets notBefore for keyId", async () => {
			const keyId = formatKeyId(defaultChainId, defaultAddress);
			mockVerifier(async ({ request }) => {
				if (request.url.endsWith("/invalidate")) {
					return okResult({ keyId, replayable: false });
				}
				return okResult({ keyId, replayable: true });
			});

			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const notBefore = Math.floor(Date.now() / 1000) + 10;
			const { response, data } = await post(auth, "/erc8128/invalidate", {
				body: { notBefore },
			});
			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.invalidatedBefore).toBe(notBefore);

			const ctx = await auth.$context;
			const invalidation = await ctx.adapter.findOne<{ notBefore: number }>({
				model: "erc8128Invalidation",
				where: [
					{ field: "kind", operator: "eq", value: "key" },
					{
						field: "matchKey",
						operator: "eq",
						value: getErc8128InvalidationMatchKey(keyId)!,
					},
				],
			});
			expect(invalidation?.notBefore).toBe(notBefore);
		});

		it("verifies /erc8128/invalidate against the original request body bytes", async () => {
			let seenBody = "";
			mockVerifier(async ({ request }) => {
				seenBody = await request.text();
				return okResult({ replayable: false });
			});
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const rawBody = '{  "signature" : "0xdeadbeef"  }';
			const { response } = await postRaw(auth, "/erc8128/invalidate", {
				body: rawBody,
			});

			expect(response.status).toBe(200);
			expect(seenBody).toBe(rawBody);
		});

		it("replayable request to invalidation endpoint returns structured 401 with Accept-Signature", async () => {
			mockVerifier(async ({ setHeaders }) => {
				setHeaders?.(
					"Accept-Signature",
					'sig=("@method" "@target-uri");alg="eip191"',
				);
				return failResult("replayable_not_allowed");
			});
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const { response, data } = await post(auth, "/erc8128/invalidate");
			expect(response.status).toBe(401);
			expect(response.headers.get("accept-signature")).toContain("@method");
			expect(data).toMatchObject({
				error: "erc8128_verification_failed",
				reason: "replayable_not_allowed",
			});
		});

		it("per-signature invalidation creates DB record and evicts from cache", async () => {
			const keyId = formatKeyId(defaultChainId, defaultAddress);
			const sigToInvalidate = "0xdeadbeef";
			mockVerifier(async ({ request }) => {
				if (request.url.endsWith("/invalidate")) {
					return okResult({ keyId, replayable: false });
				}
				return okResult({ keyId, replayable: true });
			});

			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const { response, data } = await post(auth, "/erc8128/invalidate", {
				body: { signature: sigToInvalidate },
			});
			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.invalidatedSignature).toBe(sigToInvalidate);
			// DB record should be created with the signature field
			const ctx = await auth.$context;
			const dbRecords = await ctx.adapter.findMany<{
				signatureHash?: string;
			}>({
				model: "erc8128Invalidation",
			});
			expect(dbRecords).toHaveLength(1);
			expect(dbRecords[0]?.signatureHash).toBe(
				getErc8128SignatureHash(sigToInvalidate),
			);
		});

		it("rejects providing both notBefore and signature", async () => {
			mockVerifier(async () => okResult({ replayable: false }));
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const { response } = await post(auth, "/erc8128/invalidate", {
				body: {
					notBefore: Math.floor(Date.now() / 1000) + 10,
					signature: "0xdeadbeef",
				},
			});
			// Zod refinement rejects mutually exclusive fields
			expect(response.status).not.toBe(200);
		});

		it("per-signature invalidation is enforced through verifier policy on later requests", async () => {
			const keyId = formatKeyId(defaultChainId, defaultAddress);
			const sig = "0xdeadbeefcafe";

			vi.mocked(createVerifierClient).mockImplementation(
				(args: {
					defaults?: {
						replayableInvalidated?: (value: {
							keyid: string;
							created: number;
							expires: number;
							label: string;
							signature: `0x${string}`;
							signatureBase: Uint8Array;
							signatureParamsValue: string;
						}) => Promise<boolean> | boolean;
					};
				}) => ({
					verifyRequest: vi.fn(async ({ request }) => {
						if (request.url.endsWith("/invalidate")) {
							return okResult({ keyId, replayable: false });
						}

						const invalidated = await args.defaults?.replayableInvalidated?.({
							keyid: keyId,
							created: Math.floor(Date.now() / 1000),
							expires: Math.floor(Date.now() / 1000) + 300,
							label: "eth",
							signature: sig,
							signatureBase: new Uint8Array(),
							signatureParamsValue: "sig",
						});

						return invalidated
							? failResult("replayable_invalidated")
							: okResult({ keyId, replayable: true });
					}),
				}),
			);

			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const headers = {
				signature: sig,
				"signature-input": 'sig=("@method" "@target-uri" "@authority")',
			};

			// Should pass through before invalidation (middleware verifies but doesn't create session)
			const before = await get(auth, "/get-session", { headers });
			expect(before.response.status).toBe(200);

			// Invalidate the specific signature
			const inv = await post(auth, "/erc8128/invalidate", {
				body: { signature: sig },
			});
			expect(inv.data.invalidatedSignature).toBe(sig);

			// After invalidation, parallel DB check rejects it
			const after = await get(auth, "/get-session", { headers });
			expect(after.response.status).toBe(401);
			expect(after.data).toMatchObject({
				error: "erc8128_verification_failed",
				reason: "signature_invalidated",
			});
		});

		it("loads replayable invalidation records only when verifier hooks run", async () => {
			const keyId = formatKeyId(defaultChainId, defaultAddress);
			const sig = "0xdeadbeefcafe" as const;
			const storageGet = vi.fn(async () => null);
			const releaseVerifier = createDeferred();

			vi.mocked(createVerifierClient).mockImplementation((args) => {
				const defaults = args.defaults as {
					replayableNotBefore?: (
						keyid: string,
					) => number | Promise<number | null> | null;
					replayableInvalidated?: (value: {
						keyid: string;
						created: number;
						expires: number;
						label: string;
						signature: `0x${string}`;
						signatureBase: Uint8Array;
						signatureParamsValue: string;
					}) => Promise<boolean> | boolean;
				};

				return {
					verifyRequest: vi.fn(async () => {
						await releaseVerifier.promise;

						const [notBefore, invalidated] = await Promise.all([
							defaults.replayableNotBefore?.(keyId),
							defaults.replayableInvalidated?.({
								keyid: keyId,
								created: Math.floor(Date.now() / 1000),
								expires: Math.floor(Date.now() / 1000) + 300,
								label: "eth",
								signature: sig,
								signatureBase: new Uint8Array(),
								signatureParamsValue: "sig",
							}),
						]);

						expect(notBefore).toBeNull();
						expect(invalidated).toBe(false);
						return okResult({ keyId, replayable: true });
					}),
				};
			});

			const { auth } = await getTestInstance({
				secondaryStorage: {
					get: storageGet,
					set: vi.fn(),
					delete: vi.fn(),
				},
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const pendingRequest = get(auth, "/get-session", {
				headers: {
					signature: sig,
					"signature-input": `sig=("@method" "@target-uri" "@authority");keyid="${keyId}"`,
				},
			});

			let response!: Response;
			try {
				await flushAsyncWork();
				const invalidationGetsBeforeRelease = (
					storageGet.mock.calls as unknown[][]
				)
					.map((call) => call[0])
					.filter((key) => String(key).startsWith("erc8128:inv:"));
				expect(invalidationGetsBeforeRelease).toEqual([]);

				releaseVerifier.resolve();
				({ response } = await pendingRequest);
			} finally {
				releaseVerifier.resolve();
			}

			expect(response.status).toBe(200);
			const invalidationGets = (storageGet.mock.calls as unknown[][])
				.map((call) => call[0])
				.filter((key) => String(key).startsWith("erc8128:inv:"));
			expect(invalidationGets).toEqual([
				`erc8128:inv:key:${getErc8128InvalidationMatchKey(keyId)!}`,
				`erc8128:inv:sig:${getErc8128SignatureInvalidationMatchKey(
					keyId,
					getErc8128SignatureHash(sig),
				)!}`,
			]);
		});

		it("uses one batched invalidation read when secondaryStorage supports it", async () => {
			const keyId = formatKeyId(defaultChainId, defaultAddress);
			const sig = "0xdeadbeefcafe" as const;
			const signatureHeader = "sig=:3q2+78r+:";
			const created = Math.floor(Date.now() / 1000);
			const expires = created + 300;
			const signatureParamsValue = getReplayableSignatureParamsValue({
				keyId,
				created,
				expires,
			});
			const signatureInputHeader = getReplayableSignatureInputHeader({
				keyId,
				created,
				expires,
			});
			const cacheKey = getErc8128CacheKey({
				address: defaultAddress,
				signature: sig,
				messageRaw: getReplayableMessageRaw(
					"/get-session",
					signatureParamsValue,
				),
			});
			const storageGet = vi.fn(async () => null);
			const storageGetMany = vi.fn(async (keys: string[]) =>
				keys.map(() => null),
			);

			vi.mocked(createVerifierClient).mockImplementation((args) => {
				const defaults = args.defaults as {
					replayableNotBefore?: (
						keyid: string,
					) => number | Promise<number | null> | null;
					replayableInvalidated?: (value: {
						keyid: string;
						created: number;
						expires: number;
						label: string;
						signature: `0x${string}`;
						signatureBase: Uint8Array;
						signatureParamsValue: string;
					}) => Promise<boolean> | boolean;
				};

				return {
					verifyRequest: vi.fn(async () => {
						const [notBefore, invalidated] = await Promise.all([
							defaults.replayableNotBefore?.(keyId),
							defaults.replayableInvalidated?.({
								keyid: keyId,
								created,
								expires,
								label: "eth",
								signature: sig,
								signatureBase: new Uint8Array(),
								signatureParamsValue: "sig",
							}),
						]);

						expect(notBefore).toBeNull();
						expect(invalidated).toBe(false);
						return okResult({ keyId, replayable: true });
					}),
				};
			});

			const { auth } = await getTestInstance({
				secondaryStorage: {
					get: storageGet,
					getMany: storageGetMany,
					set: vi.fn(),
					delete: vi.fn(),
				},
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const { response } = await get(auth, "/get-session", {
				headers: {
					signature: signatureHeader,
					"signature-input": signatureInputHeader,
				},
			});

			expect(response.status).toBe(200);
			expect(storageGetMany).toHaveBeenCalledTimes(1);
			expect(storageGetMany).toHaveBeenCalledWith([
				`erc8128:cache:${cacheKey}`,
				`erc8128:inv:key:${getErc8128InvalidationMatchKey(keyId)!}`,
				`erc8128:inv:sig:${getErc8128SignatureInvalidationMatchKey(
					keyId,
					getErc8128SignatureHash(sig),
				)!}`,
			]);
			const erc8128Gets = (storageGet.mock.calls as unknown[][])
				.map((call) => call[0])
				.filter((key) => String(key).startsWith("erc8128:"));
			expect(erc8128Gets).toEqual([]);
		});

		it("uses only verifier keyid for invalidation lookups", async () => {
			const hintedKeyId = formatKeyId(defaultChainId, defaultAddress);
			const actualAddress =
				"0x000000000000000000000000000000000000beef" as const;
			const actualKeyId = formatKeyId(defaultChainId, actualAddress);
			const sig = "0xdeadbeefcafe" as const;
			const storageGet = vi.fn(async () => null);

			vi.mocked(createVerifierClient).mockImplementation((args) => {
				const defaults = args.defaults as {
					replayableNotBefore?: (
						keyid: string,
					) => number | Promise<number | null> | null;
				};

				return {
					verifyRequest: vi.fn(async () => {
						const notBefore = await defaults.replayableNotBefore?.(actualKeyId);
						expect(notBefore).toBeNull();
						expect(storageGet).toHaveBeenCalledWith(
							`erc8128:inv:key:${getErc8128InvalidationMatchKey(actualKeyId)!}`,
						);

						return okResult({
							address: actualAddress,
							keyId: actualKeyId,
							replayable: true,
						});
					}),
				};
			});

			const { auth } = await getTestInstance({
				secondaryStorage: {
					get: storageGet,
					set: vi.fn(),
					delete: vi.fn(),
				},
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const { response } = await get(auth, "/get-session", {
				headers: {
					signature: sig,
					"signature-input": `sig=("@method" "@target-uri" "@authority");keyid="${hintedKeyId}"`,
				},
			});

			expect(response.status).toBe(200);
			const invalidationGets = (storageGet.mock.calls as unknown[][])
				.map((call) => call[0])
				.filter((key) => String(key).startsWith("erc8128:inv:"));
			expect(invalidationGets).toEqual([
				`erc8128:inv:key:${getErc8128InvalidationMatchKey(actualKeyId)!}`,
			]);
		});

		it("per-signature invalidation only affects the caller's own signatures", async () => {
			const userAAddress =
				"0x000000000000000000000000000000000000aaaa" as const;
			const userBAddress =
				"0x000000000000000000000000000000000000bbbb" as const;
			const userAKeyId = formatKeyId(defaultChainId, userAAddress);
			const userBKeyId = formatKeyId(defaultChainId, userBAddress);
			const userBSig = "0xuserbsignature";

			mockVerifier(async ({ request }) => {
				// User A calls /invalidate trying to invalidate User B's signature
				if (request.url.endsWith("/invalidate")) {
					return okResult({
						address: userAAddress,
						keyId: userAKeyId,
						replayable: false,
					});
				}
				// User B's replayable signature in middleware
				return okResult({
					address: userBAddress,
					keyId: userBKeyId,
					replayable: true,
				});
			});

			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			// User B's signature works before invalidation attempt
			const before = await get(auth, "/get-session", {
				headers: {
					signature: userBSig,
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
				},
			});
			expect(before.response.status).toBe(200);

			// User A tries to invalidate User B's signature
			const inv = await post(auth, "/erc8128/invalidate", {
				body: { signature: userBSig },
			});
			expect(inv.data.success).toBe(true);

			// User B's signature should still work — invalidation was by a different keyId
			const after = await get(auth, "/get-session", {
				headers: {
					signature: userBSig,
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
				},
			});
			expect(after.response.status).toBe(200);

			// Verify User B's wallet was still created (middleware passed through)
			const ctx = await auth.$context;
			const wallets = await ctx.adapter.findMany<WalletAddress>({
				model: "walletAddress",
				where: [{ field: "address", operator: "eq", value: userBAddress }],
			});
			expect(wallets).toHaveLength(1);
		});

		it("after invalidation, old replayable signatures are rejected", async () => {
			const keyId = formatKeyId(defaultChainId, defaultAddress);
			const now = Math.floor(Date.now() / 1000);
			mockVerifier(async ({ request }) => {
				if (request.url.endsWith("/verify")) {
					return okResult({ keyId, replayable: true, created: now - 20 });
				}
				if (request.url.endsWith("/invalidate")) {
					return okResult({ keyId, replayable: false });
				}
				return failResult("replayable_not_before");
			});
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			// valid replayable verification
			const first = await post(auth, "/erc8128/verify");
			expect(first.response.status).toBe(200);

			// set invalidation cutoff newer than replayable "created"
			const invalidatedBefore = now - 10;
			const invalidation = await post(auth, "/erc8128/invalidate", {
				body: { notBefore: invalidatedBefore },
			});
			expect(invalidation.response.status).toBe(200);

			// replayable verify is now rejected by verifier policy
			vi.mocked(createVerifierClient).mockImplementation(() => ({
				verifyRequest: vi.fn(async ({ request }) => {
					if (request.url.endsWith("/verify")) {
						return failResult("replayable_not_before");
					}
					return okResult({ keyId, replayable: false });
				}),
			}));

			const second = await post(auth, "/erc8128/verify");
			expect(second.response.status).toBe(401);
		});

		it("rejects class-bound signatures even when non-replayable", async () => {
			mockVerifier(async () => failResult("not_request_bound"));
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const { response, data } = await post(auth, "/erc8128/invalidate");
			expect(response.status).toBe(401);
			expect(data).toMatchObject({
				error: "erc8128_verification_failed",
				reason: "not_request_bound",
			});
		});

		it("rejects replayable signatures even when request-bound", async () => {
			mockVerifier(async () => failResult("replayable_not_allowed"));
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const { response, data } = await post(auth, "/erc8128/invalidate");
			expect(response.status).toBe(401);
			expect(data).toMatchObject({
				error: "erc8128_verification_failed",
				reason: "replayable_not_allowed",
			});
		});

		it("accepts request-bound non-replayable signatures", async () => {
			mockVerifier(async () => okResult({ replayable: false }));
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const { response, data } = await post(auth, "/erc8128/invalidate");
			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});
	});

	describe("automatic cleanup", () => {
		it("cleans expired ERC-8128 DB rows in the background when secondaryStorage is available", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

			try {
				mockVerifier(async () => okResult());
				const secondaryStorage = createMockSecondaryStorage();
				const { auth } = await getTestInstance({
					secondaryStorage: secondaryStorage.storage,
					plugins: [
						erc8128({
							verifyMessage: async () => true,
							storeInDatabase: true,
						}),
					],
				});
				const ctx = await auth.$context;

				await ctx.adapter.create({
					model: "erc8128Nonce",
					data: {
						nonceKey: "erc8128:1:0xexpired:nonce-1",
						expiresAt: new Date("2025-12-31T23:59:00.000Z"),
					},
				});
				await ctx.adapter.create({
					model: "erc8128VerificationCache",
					data: {
						cacheKey: "expired-cache",
						address: defaultAddress.toLowerCase(),
						chainId: defaultChainId,
						signatureHash: "0xdead",
						expiresAt: new Date("2025-12-31T23:59:00.000Z"),
					},
				});
				await ctx.adapter.create({
					model: "erc8128Invalidation",
					data: {
						kind: "key",
						matchKey: formatKeyId(defaultChainId, defaultAddress).toLowerCase(),
						address: defaultAddress.toLowerCase(),
						chainId: defaultChainId,
						notBefore: Math.floor(Date.now() / 1000) - 10,
						expiresAt: new Date("2025-12-31T23:59:00.000Z"),
					},
				});

				const { response } = await get(auth, "/get-session", {
					headers: {
						signature: "sig-cleanup",
						"signature-input": 'sig=("@method" "@target-uri" "@authority")',
					},
				});

				expect(response.status).toBe(200);
				await flushAsyncWork(10);

				expect(
					await ctx.adapter.findMany({ model: "erc8128Nonce" }),
				).toHaveLength(0);
				expect(
					await ctx.adapter.findMany({ model: "erc8128VerificationCache" }),
				).toHaveLength(0);
				expect(
					await ctx.adapter.findMany({ model: "erc8128Invalidation" }),
				).toHaveLength(0);
			} finally {
				vi.useRealTimers();
			}
		});

		it("can disable automatic ERC-8128 DB cleanup", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

			try {
				mockVerifier(async () => okResult());
				const secondaryStorage = createMockSecondaryStorage();
				const { auth } = await getTestInstance({
					secondaryStorage: secondaryStorage.storage,
					plugins: [
						erc8128({
							verifyMessage: async () => true,
							storeInDatabase: true,
							cleanupStrategy: "off",
						}),
					],
				});
				const ctx = await auth.$context;

				await ctx.adapter.create({
					model: "erc8128Nonce",
					data: {
						nonceKey: "erc8128:1:0xexpired:nonce-2",
						expiresAt: new Date("2025-12-31T23:59:00.000Z"),
					},
				});
				await ctx.adapter.create({
					model: "erc8128VerificationCache",
					data: {
						cacheKey: "expired-cache-disabled",
						address: defaultAddress.toLowerCase(),
						chainId: defaultChainId,
						signatureHash: "0xbeef",
						expiresAt: new Date("2025-12-31T23:59:00.000Z"),
					},
				});
				await ctx.adapter.create({
					model: "erc8128Invalidation",
					data: {
						kind: "key",
						matchKey: `${formatKeyId(defaultChainId, defaultAddress).toLowerCase()}:disabled`,
						address: defaultAddress.toLowerCase(),
						chainId: defaultChainId,
						notBefore: Math.floor(Date.now() / 1000) - 10,
						expiresAt: new Date("2025-12-31T23:59:00.000Z"),
					},
				});

				const { response } = await get(auth, "/get-session", {
					headers: {
						signature: "sig-cleanup-disabled",
						"signature-input": 'sig=("@method" "@target-uri" "@authority")',
					},
				});

				expect(response.status).toBe(200);
				await flushAsyncWork(10);

				expect(
					await ctx.adapter.findMany({ model: "erc8128Nonce" }),
				).toHaveLength(1);
				expect(
					await ctx.adapter.findMany({ model: "erc8128VerificationCache" }),
				).toHaveLength(1);
				expect(
					await ctx.adapter.findMany({ model: "erc8128Invalidation" }),
				).toHaveLength(1);
			} finally {
				vi.useRealTimers();
			}
		});

		it("does not auto-clean database rows when secondaryStorage is absent", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

			try {
				mockVerifier(async () => okResult());
				const { auth } = await getTestInstance({
					plugins: [erc8128({ verifyMessage: async () => true })],
				});
				const ctx = await auth.$context;

				await ctx.adapter.create({
					model: "erc8128Nonce",
					data: {
						nonceKey: "erc8128:1:0xexpired:nonce-db-only",
						expiresAt: new Date("2025-12-31T23:59:00.000Z"),
					},
				});

				const { response } = await get(auth, "/get-session", {
					headers: {
						signature: "sig-cleanup-db-only",
						"signature-input": 'sig=("@method" "@target-uri" "@authority")',
					},
				});

				expect(response.status).toBe(200);
				await flushAsyncWork(10);
				expect(
					await ctx.adapter.findMany({ model: "erc8128Nonce" }),
				).toHaveLength(1);
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe("replayable signature caching", () => {
		it("stores DB cache entries using the verified signature expiry", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

			try {
				const cacheSignature = "0xdeadbeef" as const;
				const keyId = formatKeyId(defaultChainId, defaultAddress);
				const expires = Math.floor(Date.now() / 1000) + 120;

				vi.mocked(createVerifierClient).mockImplementation(
					(args: { verifyMessage: VerifyMessageFn }) => ({
						verifyRequest: vi.fn(async () => {
							await args.verifyMessage({
								address: defaultAddress,
								message: { raw: "0x1234" },
								signature: cacheSignature,
							});
							return okResult({ keyId, replayable: true, expires });
						}),
					}),
				);

				const { auth } = await getTestInstance(
					{
						plugins: [
							erc8128({
								verifyMessage: async () => true,
								routePolicy: { default: { replayable: true } },
								maxValiditySec: 300,
							}),
						],
					},
					{ disableTestUser: true },
				);

				const { response } = await get(auth, "/get-session", {
					headers: {
						signature: cacheSignature,
						"signature-input": `sig=("@method" "@target-uri" "@authority");keyid="${keyId}"`,
					},
				});

				expect(response.status).toBe(200);
				await flushAsyncWork();

				const ctx = await auth.$context;
				const rows = await ctx.adapter.findMany<{
					cacheKey: string;
					signatureHash: string;
					expiresAt: Date | string | number;
				}>({
					model: "erc8128VerificationCache",
				});
				expect(rows).toHaveLength(1);
				expect(rows[0]?.signatureHash).toBe(
					getErc8128SignatureHash(cacheSignature),
				);
				expect(new Date(rows[0]!.expiresAt).getTime()).toBe(expires * 1000);
			} finally {
				vi.useRealTimers();
			}
		});

		it("does not store DB cache entries for non-replayable requests", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

			try {
				const requestSignature = "0xbeadfeed" as const;
				const keyId = formatKeyId(defaultChainId, defaultAddress);
				const expires = Math.floor(Date.now() / 1000) + 45;

				vi.mocked(createVerifierClient).mockImplementation(
					(args: {
						verifyMessage: VerifyMessageFn;
						nonceStore: {
							consume: (key: string, ttlSeconds: number) => Promise<boolean>;
						};
					}) => ({
						verifyRequest: vi.fn(async () => {
							await args.verifyMessage({
								address: defaultAddress,
								message: { raw: "0x5678" },
								signature: requestSignature,
							});
							await args.nonceStore.consume(`${keyId}:nonce-1`, 45);
							return okResult({ keyId, replayable: false, expires });
						}),
					}),
				);

				const { auth } = await getTestInstance(
					{
						plugins: [
							erc8128({
								verifyMessage: async () => true,
								routePolicy: { default: { replayable: true } },
							}),
						],
					},
					{ disableTestUser: true },
				);

				const { response } = await get(auth, "/get-session", {
					headers: {
						signature: requestSignature,
						"signature-input": `sig=("@method" "@target-uri" "@authority");keyid="${keyId}";nonce="nonce-1"`,
					},
				});

				expect(response.status).toBe(200);
				await flushAsyncWork();

				const ctx = await auth.$context;
				const cacheRows = await ctx.adapter.findMany<{ cacheKey: string }>({
					model: "erc8128VerificationCache",
				});
				const nonceRows = await ctx.adapter.findMany<{ nonceKey: string }>({
					model: "erc8128Nonce",
				});

				expect(cacheRows).toHaveLength(0);
				expect(nonceRows).toHaveLength(1);
			} finally {
				vi.useRealTimers();
			}
		});

		it("stores secondaryStorage cache entries using the verified signature expiry", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

			try {
				const storage = createMockSecondaryStorage();
				const cacheSignature = "0xfeedcafe" as const;
				const keyId = formatKeyId(defaultChainId, defaultAddress);
				const expires = Math.floor(Date.now() / 1000) + 180;

				vi.mocked(createVerifierClient).mockImplementation(
					(args: { verifyMessage: VerifyMessageFn }) => ({
						verifyRequest: vi.fn(async () => {
							await args.verifyMessage({
								address: defaultAddress,
								message: { raw: "0x9abc" },
								signature: cacheSignature,
							});
							return okResult({ keyId, replayable: true, expires });
						}),
					}),
				);

				const { auth } = await getTestInstance(
					{
						secondaryStorage: storage.storage,
						plugins: [
							erc8128({
								verifyMessage: async () => true,
								routePolicy: { default: { replayable: true } },
								maxValiditySec: 300,
							}),
						],
					},
					{ disableTestUser: true },
				);

				const { response } = await get(auth, "/get-session", {
					headers: {
						signature: cacheSignature,
						"signature-input": `sig=("@method" "@target-uri" "@authority");keyid="${keyId}"`,
					},
				});

				expect(response.status).toBe(200);
				await flushAsyncWork();

				const cacheWrites = storage.set.mock.calls.filter(
					([key]) =>
						typeof key === "string" && key.startsWith("erc8128:cache:"),
				);
				expect(cacheWrites).toHaveLength(1);
				expect(cacheWrites[0]?.[2]).toBe(180);
				expect(JSON.parse(String(cacheWrites[0]?.[1]))).toEqual({
					verified: true,
					expires,
				});
			} finally {
				vi.useRealTimers();
			}
		});

		it("does not store secondaryStorage cache entries for non-replayable requests", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

			try {
				const storage = createMockSecondaryStorage();
				const requestSignature = "0xcafefeed" as const;
				const keyId = formatKeyId(defaultChainId, defaultAddress);
				const expires = Math.floor(Date.now() / 1000) + 45;

				vi.mocked(createVerifierClient).mockImplementation(
					(args: {
						verifyMessage: VerifyMessageFn;
						defaults?: {
							replayableNotBefore?: unknown;
							replayableInvalidated?: unknown;
						};
						nonceStore: {
							consume: (key: string, ttlSeconds: number) => Promise<boolean>;
						};
					}) => ({
						verifyRequest: vi.fn(async () => {
							expect(args.defaults?.replayableNotBefore).toBeUndefined();
							expect(args.defaults?.replayableInvalidated).toBeUndefined();
							await args.verifyMessage({
								address: defaultAddress,
								message: { raw: "0xdef0" },
								signature: requestSignature,
							});
							await args.nonceStore.consume(`${keyId}:nonce-1`, 45);
							return okResult({ keyId, replayable: false, expires });
						}),
					}),
				);

				const { auth } = await getTestInstance(
					{
						secondaryStorage: storage.storage,
						plugins: [
							erc8128({
								verifyMessage: async () => true,
								routePolicy: { default: { replayable: true } },
							}),
						],
					},
					{ disableTestUser: true },
				);

				const { response } = await get(auth, "/get-session", {
					headers: {
						signature: requestSignature,
						"signature-input": `sig=("@method" "@target-uri" "@authority");keyid="${keyId}";nonce="nonce-1"`,
					},
				});

				expect(response.status).toBe(200);
				await flushAsyncWork();

				const replayableReads = storage.get.mock.calls.filter(([key]) => {
					return (
						typeof key === "string" &&
						(key.startsWith("erc8128:cache:") || key.startsWith("erc8128:inv:"))
					);
				});
				const cacheWrites = storage.set.mock.calls.filter(
					([key]) =>
						typeof key === "string" && key.startsWith("erc8128:cache:"),
				);
				const nonceWrites = storage.setIfNotExists.mock.calls.filter(
					([key]) =>
						typeof key === "string" && key.startsWith("erc8128:nonce:"),
				);

				expect(replayableReads).toHaveLength(0);
				expect(cacheWrites).toHaveLength(0);
				expect(nonceWrites).toHaveLength(1);
			} finally {
				vi.useRealTimers();
			}
		});

		it("runs full verification on every request while caching verifyMessage results", async () => {
			const verifyMessageSpy = vi.fn<
				(args: {
					address: `0x${string}`;
					message: { raw: `0x${string}` };
					signature: `0x${string}`;
				}) => Promise<boolean>
			>(async () => true);
			const verifyRequestSpy = vi.fn(
				async ({
					request,
					verifyMessage,
				}: {
					request: Request;
					verifyMessage: (args: {
						address: `0x${string}`;
						message: { raw: `0x${string}` };
						signature: `0x${string}`;
					}) => boolean | Promise<boolean>;
				}) => {
					await verifyMessage({
						address: defaultAddress,
						message: { raw: "0x1234" },
						signature: "0xdeadbeef",
					});
					return okResult({ replayable: true });
				},
			);
			vi.mocked(createVerifierClient).mockImplementation(
				(args: { verifyMessage: VerifyMessageFn }) => ({
					verifyRequest: vi.fn(async ({ request }) =>
						verifyRequestSpy({
							request,
							verifyMessage: args.verifyMessage,
						}),
					),
				}),
			);
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: verifyMessageSpy,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const headers = {
				signature: "sig-replayable",
				"signature-input": 'sig=("@method" "@target-uri" "@authority")',
			};
			const first = await get(auth, "/get-session", { headers });
			await flushAsyncWork();
			const second = await get(auth, "/get-session", { headers });

			expect(first.response.status).toBe(200);
			expect(second.response.status).toBe(200);
			expect(verifyRequestSpy).toHaveBeenCalledTimes(2);
			expect(verifyMessageSpy).toHaveBeenCalledTimes(1);
		});

		it("uses one batched replayable state read per request with secondaryStorage", async () => {
			const storage = createMockSecondaryStorage();
			const keyId = formatKeyId(defaultChainId, defaultAddress);
			const sig = "0xdeadbeef" as const;
			const created = Math.floor(Date.now() / 1000);
			const expires = created + 300;
			const signatureParamsValue = getReplayableSignatureParamsValue({
				keyId,
				created,
				expires,
			});
			const signatureInputHeader = getReplayableSignatureInputHeader({
				keyId,
				created,
				expires,
			});
			const messageRaw = getReplayableMessageRaw(
				"/get-session",
				signatureParamsValue,
			);
			const cacheKey = getErc8128CacheKey({
				address: defaultAddress,
				signature: sig,
				messageRaw,
			});
			const verifyMessageSpy = vi.fn<
				(args: {
					address: `0x${string}`;
					message: { raw: `0x${string}` };
					signature: `0x${string}`;
				}) => Promise<boolean>
			>(async () => true);
			vi.mocked(createVerifierClient).mockImplementation(
				(args: CreateVerifierClientArgs) => ({
					verifyRequest: vi.fn(async () => {
						const [notBefore, invalidated] = await Promise.all([
							args.defaults?.replayableNotBefore?.(keyId),
							args.defaults?.replayableInvalidated?.({
								keyid: keyId,
								signature: sig,
							}),
						]);
						expect(notBefore).toBeNull();
						expect(invalidated).toBe(false);
						await args.verifyMessage({
							address: defaultAddress,
							message: { raw: messageRaw },
							signature: sig,
						});
						return okResult({ replayable: true });
					}),
				}),
			);

			const { auth } = await getTestInstance({
				secondaryStorage: storage.storage,
				plugins: [
					erc8128({
						verifyMessage: verifyMessageSpy,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const headers = {
				signature: "sig=:3q2+7w==:",
				"signature-input": signatureInputHeader,
			};
			const first = await get(auth, "/get-session", { headers });
			await flushAsyncWork();
			const second = await get(auth, "/get-session", { headers });

			expect(first.response.status).toBe(200);
			expect(second.response.status).toBe(200);
			expect(verifyMessageSpy).toHaveBeenCalledTimes(1);
			expect(storage.getMany).toHaveBeenCalledTimes(2);
			expect(storage.getMany).toHaveBeenNthCalledWith(1, [
				`erc8128:cache:${cacheKey}`,
				`erc8128:inv:key:${getErc8128InvalidationMatchKey(keyId)!}`,
				`erc8128:inv:sig:${getErc8128SignatureInvalidationMatchKey(
					keyId,
					getErc8128SignatureHash(sig),
				)!}`,
			]);

			const cacheReads = storage.get.mock.calls.filter(
				([key]) => typeof key === "string" && key.startsWith("erc8128:cache:"),
			);
			expect(cacheReads).toHaveLength(0);
		});

		it("cache key includes the signature base, so different requests still re-check crypto", async () => {
			const verifyMessageSpy = vi.fn<
				(args: {
					address: `0x${string}`;
					message: { raw: `0x${string}` };
					signature: `0x${string}`;
				}) => Promise<boolean>
			>(async () => true);
			vi.mocked(createVerifierClient).mockImplementation(
				(args: { verifyMessage: VerifyMessageFn }) => ({
					verifyRequest: vi.fn(async ({ request }) => {
						await args.verifyMessage({
							address: defaultAddress,
							message: {
								raw: request.url.includes("page=2") ? "0x2222" : "0x1111",
							},
							signature: "0xdeadbeef",
						});
						return okResult({ replayable: true });
					}),
				}),
			);
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: verifyMessageSpy,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			await get(auth, "/get-session?page=1", {
				headers: {
					signature: "sig-replayable",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
				},
			});
			await get(auth, "/get-session?page=2", {
				headers: {
					signature: "sig-replayable",
					"signature-input": 'sig=("@method" "@target-uri" "@authority")',
				},
			});

			expect(verifyMessageSpy).toHaveBeenCalledTimes(2);
		});

		it("lazily sweeps expired cache entries on cache access", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

			try {
				const verifySpy = vi.fn(async ({ request }: { request: Request }) => {
					const now = Math.floor(Date.now() / 1000);
					return okResult({
						replayable: true,
						created: now,
						expires: now + 30,
					});
				});

				vi.mocked(createVerifierClient).mockImplementation(() => ({
					verifyRequest: verifySpy,
				}));

				const { auth } = await getTestInstance({
					plugins: [
						erc8128({
							verifyMessage: async () => true,
							routePolicy: { default: { replayable: true } },
						}),
					],
				});

				await get(auth, "/get-session", {
					headers: {
						signature: "sig-a",
						"signature-input": 'sig=("@method" "@target-uri" "@authority")',
					},
				});

				vi.advanceTimersByTime(61_000);

				await get(auth, "/get-session", {
					headers: {
						signature: "sig-a",
						"signature-input": 'sig=("@method" "@target-uri" "@authority")',
					},
				});

				const sigAVerifications = verifySpy.mock.calls.filter(
					([arg]) => arg.request.headers.get("signature") === "sig-a",
				);
				expect(sigAVerifications).toHaveLength(2);
			} finally {
				vi.useRealTimers();
			}
		});

		it("rejects expired replayable signatures", async () => {
			mockVerifier(async () => failResult("expired"));
			const { auth } = await getTestInstance({
				plugins: [
					erc8128({
						verifyMessage: async () => true,
						routePolicy: { default: { replayable: true } },
					}),
				],
			});

			const { response } = await post(auth, "/erc8128/verify");
			expect(response.status).toBe(401);
		});
	});
});
