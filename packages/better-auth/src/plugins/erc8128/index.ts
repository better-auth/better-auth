import type {
	AuthContext,
	BetterAuthOptions,
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import type { Session } from "@better-auth/core/db";
import type {
	DiscoveryDocumentConfig,
	RoutePolicy,
	VerifyMessageFn,
	VerifyResult,
} from "@slicekit/erc8128";
import {
	createVerifierClient,
	formatDiscoveryDocument,
	selectSignatureFromHeaders,
} from "@slicekit/erc8128";
import * as z from "zod";
import { APIError } from "../../api";
import { getSessionFromCtx } from "../../api/routes/session";
import { setSessionCookie } from "../../cookies";
import { mergeSchema } from "../../db/schema";
import type { Auth, InferOptionSchema, User } from "../../types";
import { HIDE_METADATA } from "../../utils/hide-metadata";
import { DEFAULT_ERC8128_CLEANUP_THROTTLE_SEC } from "./cleanup";
import {
	isPluginEndpoint,
	normalizeRoutePolicyConfig,
	resolveRequestRoutePolicy,
	resolveRoutePolicy,
} from "./route-policy";
import type { ERC8128Schema } from "./schema";
import { schema } from "./schema";
import { createErc8128StorageRuntime } from "./storage-runtime";
import type { ENSLookupArgs, ENSLookupResult } from "./types";
import {
	bytesToHex,
	decodeBase64ToBytes,
	getErc8128CacheKey,
	getErc8128SignatureHash,
	parseErc8128KeyId,
} from "./utils";
import type { CacheValue } from "./verification-cache";
import {
	createEphemeralSignatureSession,
	findOrCreateWalletUser,
} from "./wallet-user";

export {
	type CleanupExpiredErc8128StorageOptions,
	type CleanupExpiredErc8128StorageResult,
	cleanupExpiredErc8128Storage,
} from "./cleanup";
export {
	getRoutePolicyPathname,
	normalizeRoutePolicyConfig,
	type ResolvedRoutePolicy,
	type RoutePolicyConfig,
	resolveRequestRoutePolicy,
	resolveRoutePolicy,
} from "./route-policy";

/**
 * Fallback for invalidation TTL sizing when the user doesn't set `maxValiditySec`.
 * Must match the library's internal default (300s) so invalidation records
 * outlive the signatures they could invalidate.
 */
const DEFAULT_MAX_VALIDITY_SEC = 300;
/** Clock skew tolerance for server-side signature verification. */
const DEFAULT_CLOCK_SKEW_SEC = 30;
/** Only verify one signature per request (the first valid one). */
const MAX_SIGNATURE_VERIFICATIONS = 1;

function requestHasCookie(request: Request, cookieName: string): boolean {
	const cookieHeader = request.headers.get("cookie");
	if (!cookieHeader) {
		return false;
	}

	for (const cookie of cookieHeader.split(";")) {
		const trimmedCookie = cookie.trim();
		const separatorIndex = trimmedCookie.indexOf("=");
		if (separatorIndex === -1) {
			continue;
		}
		if (trimmedCookie.slice(0, separatorIndex) === cookieName) {
			return true;
		}
	}

	return false;
}

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		erc8128: {
			creator: typeof erc8128;
		};
	}
}

const ERC8128_VERIFICATION_CONTEXT_KEY = "__erc8128Verification";

export type Erc8128VerifiedRequest = Extract<VerifyResult, { ok: true }>;

type Erc8128ContextCarrier = {
	context?: Record<string, unknown>;
};

export function getErc8128Verification(
	ctx: Erc8128ContextCarrier,
): Erc8128VerifiedRequest | null {
	const value = ctx.context?.[ERC8128_VERIFICATION_CONTEXT_KEY];
	if (!value || typeof value !== "object") {
		return null;
	}
	return value as Erc8128VerifiedRequest;
}

export interface Erc8128Principal {
	session: Session & Record<string, any>;
	user: User & Record<string, any>;
}

export interface Erc8128VerifyRequestOptions {
	policy?: RoutePolicy | undefined;
}

export type Erc8128VerifyRequestResult =
	| {
			ok: true;
			responseHeaders: Headers;
			verification: Erc8128VerifiedRequest;
	  }
	| {
			ok: false;
			response: Response;
			responseHeaders: Headers;
	  };

export interface Erc8128ProtectOptions {
	resolveSession?: (() => Promise<Erc8128Principal | null>) | undefined;
}

export type Erc8128ProtectResult =
	| {
			ok: true;
			authenticated: boolean;
			principal: Erc8128Principal | null;
			protected: boolean;
			responseHeaders: Headers;
			source: "none" | "session" | "signature";
			verification: Erc8128VerifiedRequest | null;
	  }
	| {
			ok: false;
			protected: boolean;
			response: Response;
			responseHeaders: Headers;
	  };

export interface Erc8128ServerApi {
	getConfig: (request?: Request) => Promise<Erc8128ServerConfig>;
	protect: (
		request: Request,
		options?: Erc8128ProtectOptions,
	) => Promise<Erc8128ProtectResult>;
	verifyRequest: (
		request: Request,
		options?: Erc8128VerifyRequestOptions,
	) => Promise<Erc8128VerifyRequestResult>;
}

type Erc8128ServerConfig = ReturnType<typeof formatDiscoveryDocument>;

interface CachedVerifyMessageOps {
	verifyMessage: VerifyMessageFn;
	persist(result: Erc8128VerifiedRequest): Promise<void>;
}

type ReplayableSignatureCandidate = {
	keyId: string;
	signature: `0x${string}`;
	address: `0x${string}`;
	cacheKey: string;
};

type BetterAuthPluginWithServerApi<API extends Record<string, unknown>> =
	BetterAuthPlugin & {
		getServerApi?: (
			ctx: Promise<AuthContext> | AuthContext,
		) => Record<string, unknown>;
		$ServerAPI?: API;
	};

interface ERC8128PluginOptions {
	verifyMessage: VerifyMessageFn;
	sessionExpiresIn?: number | undefined;
	maxValiditySec?: number | undefined;
	clockSkewSec?: number | undefined;
	emailDomainName?: string | undefined;
	anonymous?: boolean | undefined;
	ensLookup?: ((args: ENSLookupArgs) => Promise<ENSLookupResult>) | undefined;
	schema?: InferOptionSchema<typeof schema> | undefined;
	/**
	 * Deprecated no-op retained for API compatibility. Replayable cache reads
	 * and writes now use persistent storage directly.
	 *
	 * @default 10000
	 */
	cacheSize?: number | undefined;
	/**
	 * Per-route policy map keyed by Better Auth endpoint paths relative to the
	 * auth `basePath` (for example `"/get-session"` or `"/erc8128/verify"`).
	 *
	 * The plugin strips Better Auth's mount prefix automatically, so users do
	 * not need to include `/api/auth` (or a custom `basePath`) in keys. Legacy
	 * basePath-prefixed keys are still accepted and normalized internally.
	 */
	routePolicy?: DiscoveryDocumentConfig["routePolicy"] | undefined;
	/**
	 * When `secondaryStorage` is configured, nonces and invalidation records
	 * are stored there by default (with TTL-based auto-cleanup). Set this to
	 * `true` to also persist them to the database, using secondaryStorage as a
	 * fast read-through layer.
	 *
	 * Follows the same pattern as Better Auth's `session.storeSessionInDatabase`.
	 *
	 * Has no effect when `secondaryStorage` is not configured (everything uses
	 * the database).
	 *
	 * @default false
	 */
	storeInDatabase?: boolean | undefined;
	/**
	 * Automatic cleanup strategy for expired ERC-8128 DB rows.
	 *
	 * - `"auto"` — use a best-effort distributed lease in `secondaryStorage`
	 *   when available, otherwise do nothing automatically.
	 * - `"off"` — disable automatic cleanup entirely.
	 *
	 * @default "auto"
	 */
	cleanupStrategy?: "auto" | "off" | undefined;
	/**
	 * Minimum time between automatic ERC-8128 DB cleanup runs.
	 *
	 * @default 300
	 */
	cleanupThrottleSec?: number | undefined;
	/**
	 * How to handle requests that carry both a session cookie and an
	 * ERC-8128 signature.
	 *
	 * - `"session-first"` — session cookie wins; signature verification
	 *   is skipped (default).
	 * - `"signature-first"` — signature wins; session cookie is ignored.
	 * - `"reject-on-mismatch"` — both are verified; if they map to
	 *   different users, return 401.
	 *
	 * @default "session-first"
	 */
	authPrecedence?:
		| "session-first"
		| "signature-first"
		| "reject-on-mismatch"
		| undefined;
}

const invalidateBodySchema = z
	.object({
		notBefore: z.number().int().positive().optional(),
		signature: z.string().startsWith("0x").optional(),
	})
	.optional()
	.refine((data) => !data || !(data.notBefore && data.signature), {
		message: "Provide either notBefore or signature, not both",
	});

function hasNonceInSignatureInput(signatureInput: string): boolean {
	return /(?:^|;)\s*nonce="[^"]*"/i.test(signatureInput);
}

function formatStructuredFieldString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function normalizeCoveredHeaderValue(value: string): string {
	return value.trim().replace(/[ \t]+/g, " ");
}

function getCoveredRequestComponentValue(
	request: Request,
	url: URL,
	component: string,
): string | null {
	switch (component) {
		case "@method":
			return request.method.toUpperCase();
		case "@authority": {
			const protocol = url.protocol.replace(":", "").toLowerCase();
			const hostname = url.hostname.toLowerCase();
			const port = url.port;
			if (!port) {
				return hostname;
			}
			const portNumber = Number(port);
			if (
				(protocol === "http" && portNumber === 80) ||
				(protocol === "https" && portNumber === 443)
			) {
				return hostname;
			}
			return `${hostname}:${port}`;
		}
		case "@path":
			return url.pathname || "/";
		case "@query":
			return url.search || "";
		case "@target-uri":
			return url.toString();
		default: {
			const header = request.headers.get(component);
			return header == null ? null : normalizeCoveredHeaderValue(header);
		}
	}
}

function buildReplayableMessageRaw(
	request: Request,
	components: string[],
	signatureParamsValue: string,
): `0x${string}` | null {
	try {
		const url = new URL(request.url);
		const lines = components.map((component) => {
			const value = getCoveredRequestComponentValue(request, url, component);
			if (
				value == null ||
				/[^\x20-\x7E]/.test(value) ||
				value.includes("\r") ||
				value.includes("\n")
			) {
				throw new Error("bad_covered_component");
			}
			return `${formatStructuredFieldString(component)}: ${value}`;
		});
		const signatureBase =
			lines.length > 0
				? `${lines.join("\n")}\n${formatStructuredFieldString("@signature-params")}: ${signatureParamsValue}`
				: `${formatStructuredFieldString("@signature-params")}: ${signatureParamsValue}`;
		return bytesToHex(new TextEncoder().encode(signatureBase));
	} catch {
		return null;
	}
}

function getSingleReplayableSignatureCandidate(
	request: Request,
	signatureHeader: string,
	signatureInputHeader: string,
): ReplayableSignatureCandidate | null {
	const selection = selectSignatureFromHeaders({
		signatureHeader,
		signatureInputHeader,
		policy: {
			label: undefined,
			strictLabel: false,
		},
	});
	if (!selection.ok || selection.selected.length !== 1) {
		return null;
	}

	const candidate = selection.selected[0];
	if (!candidate) {
		return null;
	}
	if (typeof candidate.params.keyid !== "string") {
		return null;
	}
	if (typeof candidate.sigB64 !== "string") {
		return null;
	}

	const signatureBytes = decodeBase64ToBytes(candidate.sigB64);
	if (!signatureBytes || signatureBytes.length === 0) {
		return null;
	}
	const parsedKeyId = parseErc8128KeyId(candidate.params.keyid);
	if (!parsedKeyId) {
		return null;
	}
	const messageRaw = buildReplayableMessageRaw(
		request,
		candidate.components,
		candidate.signatureParamsValue,
	);
	if (!messageRaw) {
		return null;
	}
	const signature = bytesToHex(signatureBytes);
	const address = parsedKeyId.address.toLowerCase() as `0x${string}`;

	return {
		keyId: candidate.params.keyid.toLowerCase(),
		signature,
		address,
		cacheKey: getErc8128CacheKey({
			address,
			signature,
			messageRaw,
		}),
	};
}

const WWW_AUTHENTICATE_HEADER =
	'Signature realm="erc8128", headers="@method @target-uri @authority"';

function toHeaders(headers: Record<string, string>) {
	return new Headers(headers);
}

function jsonErrorResponse(
	status: number,
	body: Record<string, unknown>,
	headers?: Record<string, string>,
) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			...(headers ?? {}),
		},
	});
}

type VerifyFailure = Extract<VerifyResult, { ok: false }>;

function getVerifyFailure(result: VerifyResult): VerifyFailure | null {
	if (!result.ok) {
		return result;
	}
	const nowSec = Math.floor(Date.now() / 1000);
	if (nowSec < result.params.expires) {
		return null;
	}
	return {
		ok: false,
		reason: "expired",
	};
}

function cloneAuthContextForRequest<Options extends BetterAuthOptions>(
	authContext: AuthContext<Options>,
	request?: Request,
) {
	const context = Object.create(
		Object.getPrototypeOf(authContext),
		Object.getOwnPropertyDescriptors(authContext),
	) as AuthContext<Options>;

	if (!context.baseURL && request) {
		context.baseURL = new URL(
			authContext.options.basePath || "/api/auth",
			request.url,
		).toString();
	}

	return context;
}

function withoutSignatureHeaders(request: Request) {
	const headers = new Headers(request.headers);
	headers.delete("signature");
	headers.delete("signature-input");
	return headers;
}

function createGenericRequestContext<Options extends BetterAuthOptions>(
	authContext: AuthContext<Options>,
	request: Request,
	headers: Headers = request.headers,
): GenericEndpointContext {
	return {
		request,
		headers,
		context: cloneAuthContextForRequest(authContext, request),
	} as unknown as GenericEndpointContext;
}

async function requireErc8128Context<Options extends BetterAuthOptions>(
	auth: Auth<Options>,
) {
	const ctx = await auth.$context;
	if (!("erc8128" in ctx) || !ctx.erc8128) {
		throw new Error(
			"[better-auth][erc8128] ERC-8128 plugin is not installed on this auth instance.",
		);
	}
	return ctx.erc8128 as Erc8128ServerApi;
}

export function getErc8128Api<Options extends BetterAuthOptions>(
	auth: Auth<Options>,
): Erc8128ServerApi {
	if ((auth.api as Record<string, unknown>).erc8128) {
		return (auth.api as Record<string, unknown>).erc8128 as Erc8128ServerApi;
	}
	return {
		getConfig: async (request) => {
			const api = await requireErc8128Context(auth);
			return api.getConfig(request);
		},
		protect: async (request, options) => {
			const api = await requireErc8128Context(auth);
			const protectOptions: Erc8128ProtectOptions = {
				resolveSession:
					options?.resolveSession ??
					(async () => {
						const sessionContext = createGenericRequestContext(
							await auth.$context,
							request,
							withoutSignatureHeaders(request),
						);
						const session = await getSessionFromCtx(sessionContext).catch(
							() => null,
						);

						return session
							? {
									session: session.session as Session & Record<string, any>,
									user: session.user as User & Record<string, any>,
								}
							: null;
					}),
			};
			return api.protect(request, protectOptions);
		},
		verifyRequest: async (request, options) => {
			const api = await requireErc8128Context(auth);
			return api.verifyRequest(request, options);
		},
	};
}

export const erc8128 = (options: ERC8128PluginOptions) => {
	const allowsReplayable = (
		policy: RoutePolicy | RoutePolicy[] | false | undefined,
	): boolean =>
		(Array.isArray(policy) ? policy : [policy]).some(
			(entry) => entry !== false && entry?.replayable === true,
		);

	const replayableEnabled =
		allowsReplayable(options.routePolicy?.default) ||
		(options.routePolicy != null &&
			Object.values(options.routePolicy).some((policy) =>
				allowsReplayable(policy),
			));

	let warnedNoStorage = false;
	let warnedReplayableNoStorage = false;
	const cleanupThrottleSec =
		options.cleanupThrottleSec ?? DEFAULT_ERC8128_CLEANUP_THROTTLE_SEC;
	const keyInvalidationWindowSec =
		(options.maxValiditySec ?? DEFAULT_MAX_VALIDITY_SEC) +
		(options.clockSkewSec ?? DEFAULT_CLOCK_SKEW_SEC);

	const warnNoStorage = () => {
		if (warnedNoStorage) return;
		warnedNoStorage = true;
		console.warn(
			"[better-auth][erc8128] No persistent storage available (DB/secondaryStorage). " +
				"Falling back to request-bound middleware verification only for explicit routePolicy routes. " +
				"Endpoints requiring persistence (/erc8128/verify, /erc8128/invalidate) are disabled.",
		);
	};

	const warnReplayableNoStorage = () => {
		if (warnedReplayableNoStorage) return;
		warnedReplayableNoStorage = true;
		console.warn(
			"[better-auth][erc8128] Replayable route policy requested without persistent storage. " +
				"Replayable signatures require DB or secondaryStorage. Protected replayable routes will fail.",
		);
	};

	const storageRuntime = createErc8128StorageRuntime({
		maxValiditySec: options.maxValiditySec,
		storeInDatabase: options.storeInDatabase,
		cleanupStrategy: options.cleanupStrategy,
		cleanupThrottleSec,
		warnNoStorage,
		defaultMaxValiditySec: DEFAULT_MAX_VALIDITY_SEC,
	});

	const createCachedVerifyMessage = (
		ctx: GenericEndpointContext,
		storageMode: "secondary-storage" | "database" | "none",
		replayableRequestEnabled: boolean,
		replayableCandidate: ReplayableSignatureCandidate | null,
		getReplayableState:
			| (() => Promise<{
					keyNotBefore: number | null;
					signatureInvalidated: boolean;
					cacheHit: boolean;
			  }>)
			| null,
	): CachedVerifyMessageOps => {
		if (!replayableRequestEnabled || storageMode === "none") {
			return {
				verifyMessage: options.verifyMessage,
				async persist() {},
			};
		}

		const persistentCache = storageRuntime.getCache(ctx);
		let pending: {
			cacheKey: string;
			address: string;
			signatureHash: string;
		} | null = null;

		return {
			verifyMessage: async (args) => {
				persistentCache.sweep();
				const cacheKey = getErc8128CacheKey({
					address: args.address,
					signature: args.signature,
					messageRaw: args.message.raw,
				});
				const canUseReplayableState =
					replayableCandidate &&
					getReplayableState &&
					args.address.toLowerCase() === replayableCandidate.address &&
					args.signature === replayableCandidate.signature &&
					cacheKey === replayableCandidate.cacheKey;
				if (canUseReplayableState && (await getReplayableState()).cacheHit) {
					return true;
				}
				if (!canUseReplayableState && (await persistentCache.get(cacheKey))) {
					return true;
				}

				const verified = await options.verifyMessage(args);
				if (verified) {
					pending = {
						cacheKey,
						address: args.address.toLowerCase(),
						signatureHash: getErc8128SignatureHash(args.signature),
					};
				}
				return verified;
			},
			async persist(result) {
				if (!pending || !result.replayable) {
					return;
				}
				const nowSec = Math.floor(Date.now() / 1000);
				const ttlSec = Math.max(result.params.expires - nowSec, 1);
				const value = {
					verified: true,
					expires: result.params.expires,
				} satisfies CacheValue;
				const cacheWrite = {
					key: pending.cacheKey,
					value,
					ttlSec,
					address: pending.address,
					chainId: result.chainId,
					signatureHash: pending.signatureHash,
					expiresAt: new Date(result.params.expires * 1000),
				};

				pending = null;
				void persistentCache.set(cacheWrite).catch(() => {});
			},
		};
	};

	const verifyBodySchema = z
		.object({
			email: z.email().optional(),
		})
		.optional()
		.refine((data) => options.anonymous !== false || !!data?.email, {
			message:
				"Email is required when the anonymous plugin option is disabled.",
			path: ["email"],
		});

	const createRequestContext = (
		authContext: AuthContext<BetterAuthOptions>,
		request: Request,
	): GenericEndpointContext => {
		return {
			request,
			headers: request.headers,
			context: cloneAuthContextForRequest(authContext, request),
		} as GenericEndpointContext;
	};

	const getServerConfig = async (
		ctx: GenericEndpointContext,
	): Promise<Erc8128ServerConfig> => {
		const storageMode = await storageRuntime.ensureStorageMode(ctx);
		const baseURL = ctx.context.baseURL;

		return {
			...formatDiscoveryDocument({
				verificationEndpoint:
					storageMode === "none" ? undefined : `${baseURL}/erc8128/verify`,
				invalidationEndpoint:
					replayableEnabled && storageMode !== "none"
						? `${baseURL}/erc8128/invalidate`
						: undefined,
				maxValiditySec: options.maxValiditySec,
				routePolicy: options.routePolicy
					? normalizeRoutePolicyConfig(options.routePolicy, baseURL)
					: undefined,
			}),
		};
	};

	const verifyRequestInternal = async (
		ctx: GenericEndpointContext,
		request: Request,
		policy?: RoutePolicy,
	): Promise<Erc8128VerifyRequestResult> => {
		const storageMode = storageRuntime.ensureStorageMode(ctx);
		void storageRuntime.scheduleCleanup(ctx);
		if (storageMode === "none" && policy?.replayable) {
			warnReplayableNoStorage();
			return {
				ok: false,
				response: jsonErrorResponse(
					401,
					{
						error: "erc8128_verification_failed",
						reason: "replayable_requires_storage",
						detail:
							"Replayable route policy requires database or secondaryStorage",
					},
					{
						"WWW-Authenticate": WWW_AUTHENTICATE_HEADER,
					},
				),
				responseHeaders: new Headers({
					"WWW-Authenticate": WWW_AUTHENTICATE_HEADER,
				}),
			};
		}

		const signature = request.headers.get("signature");
		const signatureInput = request.headers.get("signature-input");
		if (!signature || !signatureInput) {
			const responseHeaders = new Headers({
				"WWW-Authenticate": WWW_AUTHENTICATE_HEADER,
			});
			return {
				ok: false,
				response: jsonErrorResponse(
					401,
					{
						error: "erc8128_verification_failed",
						reason: "missing_signature",
						detail: "Signature and Signature-Input headers are required",
					},
					Object.fromEntries(responseHeaders.entries()),
				),
				responseHeaders,
			};
		}

		// Replayable cache/invalidation is an opt-in fast path. A request only
		// gets that extra machinery when the route explicitly allows replayable
		// signatures and the signature itself does not carry a nonce.
		const replayableRequestEnabled =
			replayableEnabled &&
			storageMode !== "none" &&
			policy?.replayable === true &&
			!hasNonceInSignatureInput(signatureInput);

		const invalidationOps = replayableRequestEnabled
			? storageRuntime.getInvalidationOps(ctx, storageMode)
			: null;
		const replayableSignatureCandidate = replayableRequestEnabled
			? getSingleReplayableSignatureCandidate(
					request,
					signature,
					signatureInput,
				)
			: null;
		let replayableStatePromise: Promise<{
			keyNotBefore: number | null;
			signatureInvalidated: boolean;
			cacheHit: boolean;
		}> | null = null;
		const getReplayableStateForCandidate =
			replayableSignatureCandidate === null
				? null
				: () => {
						if (!replayableStatePromise) {
							replayableStatePromise = invalidationOps!.findVerificationState(
								replayableSignatureCandidate.keyId,
								replayableSignatureCandidate.signature,
								replayableSignatureCandidate.cacheKey,
							);
						}
						return replayableStatePromise;
					};
		const getReplayableState = (
			keyid: string,
			signatureValue?: `0x${string}`,
		) => {
			const normalizedKeyId = keyid.toLowerCase();
			if (
				!replayableSignatureCandidate ||
				replayableSignatureCandidate.keyId !== normalizedKeyId ||
				(signatureValue &&
					replayableSignatureCandidate.signature !== signatureValue)
			) {
				return null;
			}
			return getReplayableStateForCandidate?.() ?? null;
		};

		const cachedVerifyMessage = createCachedVerifyMessage(
			ctx,
			storageMode,
			replayableRequestEnabled,
			replayableSignatureCandidate,
			getReplayableStateForCandidate,
		);
		const verifier = createVerifierClient({
			verifyMessage: cachedVerifyMessage.verifyMessage,
			nonceStore: storageRuntime.getNonceStore(ctx, storageMode),
			defaults: {
				maxValiditySec: options.maxValiditySec,
				clockSkewSec: options.clockSkewSec ?? DEFAULT_CLOCK_SKEW_SEC,
				maxSignatureVerifications: MAX_SIGNATURE_VERIFICATIONS,
				...(replayableRequestEnabled
					? {
							replayableNotBefore: async (keyid: string) => {
								const replayableState = getReplayableState(keyid);
								if (replayableState !== null) {
									return (await replayableState).keyNotBefore;
								}
								const records = await invalidationOps!.findByKeyId(
									keyid.toLowerCase(),
								);
								const keyRecord = records.find(
									(record) => !record.signatureHash,
								);
								return keyRecord?.notBefore ?? null;
							},
							replayableInvalidated: async ({ keyid, signature }) => {
								const replayableState = getReplayableState(keyid, signature);
								if (replayableState !== null) {
									return (await replayableState).signatureInvalidated;
								}
								const record = await invalidationOps!.findBySignature(
									signature,
									keyid.toLowerCase(),
								);
								return !!(
									record &&
									(!record.keyId || record.keyId === keyid.toLowerCase())
								);
							},
						}
					: {}),
			},
		});

		const responseHeaders: Record<string, string> = {};
		const result = await verifier.verifyRequest({
			request,
			policy,
			setHeaders: (name, value) => {
				responseHeaders[name] = value;
			},
		});
		const failure = getVerifyFailure(result);

		if (failure) {
			const reason =
				failure.reason === "replayable_invalidated"
					? "signature_invalidated"
					: failure.reason;
			const detail =
				failure.reason === "replayable_invalidated"
					? "Signature has been explicitly invalidated"
					: failure.detail;
			return {
				ok: false,
				response: jsonErrorResponse(
					401,
					{
						error: "erc8128_verification_failed",
						reason,
						detail,
					},
					responseHeaders,
				),
				responseHeaders: toHeaders(responseHeaders),
			};
		}

		if (!result.ok) {
			// Unreachable: getVerifyFailure returns non-null for !ok results.
			// This branch exists solely for TypeScript narrowing.
			throw new Error("[better-auth][erc8128] Unexpected verification state");
		}

		if (storageMode === "database") {
			await cachedVerifyMessage.persist(result);
		} else {
			void cachedVerifyMessage.persist(result).catch(() => {});
		}

		return {
			ok: true,
			responseHeaders: toHeaders(responseHeaders),
			verification: result,
		};
	};

	const protectRequestInternal = async (
		ctx: GenericEndpointContext,
		request: Request,
		protectOptions?: Erc8128ProtectOptions,
	): Promise<Erc8128ProtectResult> => {
		const resolvedRoutePolicy = resolveRoutePolicy(
			options.routePolicy,
			request,
			ctx.context.baseURL,
		);

		if (resolvedRoutePolicy.skipVerification) {
			return {
				ok: true,
				authenticated: false,
				principal: null,
				protected: false,
				responseHeaders: new Headers(),
				source: "none",
				verification: null,
			};
		}

		const precedence = options.authPrecedence ?? "session-first";
		const hasSessionCookie = requestHasCookie(
			request,
			ctx.context.authCookies.sessionToken.name,
		);
		const currentSessionPromise =
			protectOptions?.resolveSession &&
			hasSessionCookie &&
			precedence === "reject-on-mismatch"
				? protectOptions.resolveSession()
				: null;
		const currentSession =
			protectOptions?.resolveSession &&
			hasSessionCookie &&
			!currentSessionPromise
				? await protectOptions.resolveSession()
				: null;

		if (currentSession && precedence === "session-first") {
			return {
				ok: true,
				authenticated: true,
				principal: currentSession,
				protected: resolvedRoutePolicy.requireAuth,
				responseHeaders: new Headers(),
				source: "session",
				verification: null,
			};
		}

		const hasSignatureHeaders =
			!!request.headers.get("signature") &&
			!!request.headers.get("signature-input");
		if (!hasSignatureHeaders) {
			if (!resolvedRoutePolicy.requireAuth) {
				return {
					ok: true,
					authenticated: false,
					principal: null,
					protected: false,
					responseHeaders: new Headers(),
					source: "none",
					verification: null,
				};
			}

			return {
				ok: false,
				protected: true,
				response: jsonErrorResponse(
					401,
					{
						error: "erc8128_verification_failed",
						reason: "missing_signature",
						detail: "Signature and Signature-Input headers are required",
					},
					{
						"WWW-Authenticate": WWW_AUTHENTICATE_HEADER,
					},
				),
				responseHeaders: new Headers({
					"WWW-Authenticate": WWW_AUTHENTICATE_HEADER,
				}),
			};
		}

		const verificationResult = await verifyRequestInternal(
			ctx,
			request,
			resolvedRoutePolicy.policy,
		);
		if (!verificationResult.ok) {
			if (!resolvedRoutePolicy.requireAuth) {
				return {
					ok: true,
					authenticated: false,
					principal: null,
					protected: false,
					responseHeaders: verificationResult.responseHeaders,
					source: "none",
					verification: null,
				};
			}
			return {
				ok: false,
				protected: true,
				response: verificationResult.response,
				responseHeaders: verificationResult.responseHeaders,
			};
		}

		const walletUser = await findOrCreateWalletUser(ctx, {
			walletAddress: verificationResult.verification.address,
			chainId: verificationResult.verification.chainId,
			anonymous: options.anonymous,
			emailDomainName: options.emailDomainName,
			ensLookup: options.ensLookup,
		});
		const resolvedCurrentSession = currentSessionPromise
			? await currentSessionPromise
			: currentSession;

		if (!walletUser) {
			return {
				ok: false,
				protected: resolvedRoutePolicy.requireAuth,
				response: jsonErrorResponse(401, {
					error: "erc8128_verification_failed",
					reason: "wallet_not_linked",
					detail:
						"Wallet is not linked to a Better Auth user and anonymous onboarding is disabled",
				}),
				responseHeaders: new Headers(),
			};
		}

		if (
			resolvedCurrentSession &&
			precedence === "reject-on-mismatch" &&
			resolvedCurrentSession.user.id !== walletUser.id
		) {
			return {
				ok: false,
				protected: resolvedRoutePolicy.requireAuth,
				response: jsonErrorResponse(401, {
					error: "erc8128_verification_failed",
					reason: "identity_mismatch",
					detail: "Session user does not match signature identity",
				}),
				responseHeaders: new Headers(),
			};
		}

		const principal =
			resolvedCurrentSession && precedence === "reject-on-mismatch"
				? resolvedCurrentSession
				: createEphemeralSignatureSession(
						walletUser,
						verificationResult.verification,
						request,
					);

		return {
			ok: true,
			authenticated: true,
			principal,
			protected: resolvedRoutePolicy.requireAuth,
			responseHeaders: verificationResult.responseHeaders,
			source: "signature",
			verification: verificationResult.verification,
		};
	};

	return {
		id: "erc8128",
		getServerApi(ctx: Promise<AuthContext> | AuthContext) {
			return {
				erc8128: {
					getConfig: async (request?: Request) => {
						const authContext = await ctx;
						if (!("erc8128" in authContext) || !authContext.erc8128) {
							throw new Error(
								"[better-auth][erc8128] ERC-8128 server API unavailable.",
							);
						}
						return (authContext.erc8128 as Erc8128ServerApi).getConfig(request);
					},
					protect: async (
						request: Request,
						protectOptions?: Erc8128ProtectOptions,
					) => {
						const authContext = await ctx;
						if (!("erc8128" in authContext) || !authContext.erc8128) {
							throw new Error(
								"[better-auth][erc8128] ERC-8128 server API unavailable.",
							);
						}
						return (authContext.erc8128 as Erc8128ServerApi).protect(
							request,
							protectOptions,
						);
					},
					verifyRequest: async (
						request: Request,
						verifyOptions?: Erc8128VerifyRequestOptions,
					) => {
						const authContext = await ctx;
						if (!("erc8128" in authContext) || !authContext.erc8128) {
							throw new Error(
								"[better-auth][erc8128] ERC-8128 server API unavailable.",
							);
						}
						return (authContext.erc8128 as Erc8128ServerApi).verifyRequest(
							request,
							verifyOptions,
						);
					},
				} satisfies Erc8128ServerApi,
			};
		},
		schema: mergeSchema(schema, options?.schema) as ERC8128Schema,
		init(ctx) {
			return {
				context: {
					erc8128: {
						getConfig: async (request?: Request) =>
							getServerConfig(
								createRequestContext(
									ctx as AuthContext<BetterAuthOptions>,
									request ??
										new Request(
											ctx.baseURL ||
												"http://localhost" +
													(ctx.options.basePath || "/api/auth"),
										),
								),
							),
						protect: async (
							request: Request,
							protectOptions?: Erc8128ProtectOptions,
						) =>
							protectRequestInternal(
								createRequestContext(
									ctx as AuthContext<BetterAuthOptions>,
									request,
								),
								request,
								protectOptions,
							),
						verifyRequest: async (
							request: Request,
							verifyOptions?: Erc8128VerifyRequestOptions,
						) => {
							const requestContext = createRequestContext(
								ctx as AuthContext<BetterAuthOptions>,
								request,
							);
							const requestAuthContext =
								requestContext.context as AuthContext<BetterAuthOptions>;
							const resolvedPolicy =
								verifyOptions?.policy ??
								resolveRequestRoutePolicy(
									options.routePolicy,
									request,
									requestAuthContext.baseURL,
								);

							return verifyRequestInternal(
								requestContext,
								request,
								resolvedPolicy,
							);
						},
					} satisfies Erc8128ServerApi,
				},
			};
		},
		hooks: {
			before: [
				{
					matcher(context: { request?: Request; headers?: Headers }) {
						if (context.request) {
							// Skip the plugin's own endpoints — they handle their own verification
							if (isPluginEndpoint(context.request)) {
								return false;
							}

							if (options.routePolicy) {
								return true;
							}
						}

						const headers = context.request?.headers || context.headers;
						if (!headers) {
							return false;
						}

						return !!(
							headers.get("signature") && headers.get("signature-input")
						);
					},
					handler: createAuthMiddleware(async (ctx: GenericEndpointContext) => {
						if (!ctx.request) {
							return;
						}

						if (isPluginEndpoint(ctx.request, ctx.context.baseURL)) {
							return;
						}

						const hasSessionCookie = requestHasCookie(
							ctx.request,
							ctx.context.authCookies.sessionToken.name,
						);
						const precedence = options.authPrecedence ?? "session-first";

						const result = await protectRequestInternal(ctx, ctx.request, {
							resolveSession:
								hasSessionCookie &&
								(precedence === "reject-on-mismatch" ||
									precedence === "session-first")
									? async () => {
											const session = await getSessionFromCtx(ctx);
											return session
												? {
														session: session.session,
														user: session.user,
													}
												: null;
										}
									: undefined,
						});

						if (!result.ok) {
							return result.response;
						}

						if (result.verification) {
							(ctx.context as typeof ctx.context & Record<string, unknown>)[
								ERC8128_VERIFICATION_CONTEXT_KEY
							] = result.verification;
						}

						if (result.principal && result.source === "signature") {
							ctx.context.session = result.principal;
						}
					}),
				},
			],
		},
		endpoints: {
			getErc8128Config: createAuthEndpoint(
				"/.well-known/erc8128",
				{
					method: "GET",
					metadata: HIDE_METADATA,
				},
				async (ctx) => ctx.json(await getServerConfig(ctx)),
			),
			verifyErc8128: createAuthEndpoint(
				"/erc8128/verify",
				{
					method: "POST",
					body: verifyBodySchema,
					requireRequest: true,
					cloneRequest: true,
				},
				async (ctx) => {
					const storageMode = await storageRuntime.ensureStorageMode(ctx);
					void storageRuntime.scheduleCleanup(ctx);
					if (storageMode === "none") {
						return new Response(null, { status: 404 });
					}
					// Verify endpoint requires request-bound, non-replayable signatures
					// (replayable/class-bound flexibility is for the middleware only)
					const verifier = createVerifierClient({
						verifyMessage: options.verifyMessage,
						nonceStore: storageRuntime.getNonceStore(ctx, storageMode),
						defaults: {
							maxValiditySec: options.maxValiditySec,
							clockSkewSec: options.clockSkewSec ?? DEFAULT_CLOCK_SKEW_SEC,
							maxSignatureVerifications: MAX_SIGNATURE_VERIFICATIONS,
							replayable: false,
						},
					});

					const responseHeaders: Record<string, string> = {};

					const sourceRequest = ctx.request!;
					const result = await verifier.verifyRequest({
						request: sourceRequest,
						setHeaders: (name, value) => {
							responseHeaders[name] = value;
						},
					});
					const verifyFailure = getVerifyFailure(result);
					if (verifyFailure) {
						return new Response(
							JSON.stringify({
								error: "erc8128_verification_failed",
								reason: verifyFailure.reason,
								detail: verifyFailure.detail,
							}),
							{
								status: 401,
								headers: {
									"Content-Type": "application/json",
									...responseHeaders,
								},
							},
						);
					}
					if (!result.ok) {
						throw new Error(
							"[better-auth][erc8128] Unexpected verification state",
						);
					}

					const key = parseErc8128KeyId(result.params.keyid);
					if (!key) {
						throw APIError.fromStatus("UNAUTHORIZED", {
							message: "Unauthorized: bad_keyid",
							status: 401,
						});
					}

					const { address: walletAddress, chainId } = key;
					const isAnon = options.anonymous ?? true;

					if (!isAnon && !ctx.body?.email) {
						throw APIError.fromStatus("BAD_REQUEST", {
							message: "Email is required when anonymous is disabled.",
							status: 400,
						});
					}

					const user = await findOrCreateWalletUser(ctx, {
						walletAddress,
						chainId,
						email: ctx.body?.email,
						anonymous: options.anonymous,
						emailDomainName: options.emailDomainName,
						ensLookup: options.ensLookup,
					});
					if (!user) {
						throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
							message: "Failed to create or find user",
							status: 500,
						});
					}

					const session = await ctx.context.internalAdapter.createSession(
						user.id,
						undefined,
						options.sessionExpiresIn
							? {
									expiresAt: new Date(
										Date.now() + options.sessionExpiresIn * 1000,
									),
								}
							: undefined,
					);

					await setSessionCookie(ctx, { session, user });

					return ctx.json({
						token: session.token,
						success: true,
						user: {
							id: user.id,
							walletAddress,
							chainId,
						},
					});
				},
			),
			...(replayableEnabled
				? {
						invalidateErc8128: createAuthEndpoint(
							"/erc8128/invalidate",
							{
								method: "POST",
								body: invalidateBodySchema,
								requireRequest: true,
								cloneRequest: true,
							},
							async (ctx) => {
								const storageMode = await storageRuntime.ensureStorageMode(ctx);
								void storageRuntime.scheduleCleanup(ctx);
								if (storageMode === "none") {
									return new Response(null, { status: 404 });
								}
								const verifier = createVerifierClient({
									verifyMessage: options.verifyMessage,
									nonceStore: storageRuntime.getNonceStore(ctx, storageMode),
									defaults: {
										maxValiditySec: options.maxValiditySec,
										clockSkewSec:
											options.clockSkewSec ?? DEFAULT_CLOCK_SKEW_SEC,
										maxSignatureVerifications: MAX_SIGNATURE_VERIFICATIONS,
										replayable: false,
									},
								});

								const responseHeaders: Record<string, string> = {};

								const sourceRequest = ctx.request!;
								const result = await verifier.verifyRequest({
									request: sourceRequest,
									setHeaders: (name, value) => {
										responseHeaders[name] = value;
									},
								});
								const verifyFailure = getVerifyFailure(result);
								if (verifyFailure) {
									const failure = verifyFailure;
									return new Response(
										JSON.stringify({
											error: "erc8128_verification_failed",
											reason: failure.reason,
											detail: failure.detail,
										}),
										{
											status: 401,
											headers: {
												"Content-Type": "application/json",
												...responseHeaders,
											},
										},
									);
								}

								if (!result.ok) {
									throw new Error(
										"[better-auth][erc8128] Unexpected verification state",
									);
								}

								const invOps = storageRuntime.getInvalidationOps(
									ctx,
									storageMode,
								);
								const maxValidity = options.maxValiditySec;

								// Per-signature invalidation
								if (ctx.body?.signature) {
									const sigToInvalidate = ctx.body.signature;
									await invOps.upsertSignatureInvalidation(
										result.params.keyid,
										sigToInvalidate,
										maxValidity ?? DEFAULT_MAX_VALIDITY_SEC,
									);

									return ctx.json({
										success: true,
										invalidatedSignature: sigToInvalidate,
									});
								}

								// Per-keyId invalidation (default to now+1 so signatures created this second are invalidated)
								const notBefore =
									ctx.body?.notBefore ?? Math.floor(Date.now() / 1000) + 1;

								await invOps.upsertKeyIdNotBefore(
									result.params.keyid,
									notBefore,
									keyInvalidationWindowSec,
								);

								return ctx.json({
									success: true,
									invalidatedBefore: notBefore,
								});
							},
						),
					}
				: {}),
		},
		options,
		$ServerAPI: {
			erc8128: {} as Erc8128ServerApi,
		},
	} satisfies BetterAuthPluginWithServerApi<{ erc8128: Erc8128ServerApi }>;
};
