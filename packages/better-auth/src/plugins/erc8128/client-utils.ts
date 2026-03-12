import type {
	AcceptSignatureSignOptions,
	SignerClient,
} from "@slicekit/erc8128";
import {
	normalizeAcceptSignatureSignOptions,
	parseSignatureInputHeader,
} from "@slicekit/erc8128";

export interface CachedSignature {
	signature: string;
	signatureInput: string;
	expires: number;
	signOptions?: AcceptSignatureSignOptions;
	binding?: "request-bound" | "class-bound";
	requestKey?: string;
	components: string[];
}

export interface Erc8128SignatureStore {
	get(
		keyId: string,
	): CachedSignature[] | null | Promise<CachedSignature[] | null>;
	set(keyId: string, entries: CachedSignature[]): void | Promise<void>;
	delete(keyId: string): void | Promise<void>;
}

export type SignedRequestResult = {
	headers: Headers;
	signature: string;
	signatureInput: string;
};

interface ResolveStoreOptions {
	storage?: "localStorage" | Erc8128SignatureStore | false;
	storagePrefix?: string;
}

interface SignRequestWithCacheArgs {
	request: Request;
	client: SignerClient;
	keyId: string;
	store: Erc8128SignatureStore | null;
	margin: number;
	signOptions: AcceptSignatureSignOptions;
}

function isBodyInit(body: unknown): body is BodyInit {
	return (
		typeof body === "string" ||
		body instanceof URLSearchParams ||
		(typeof FormData !== "undefined" && body instanceof FormData) ||
		(typeof Blob !== "undefined" && body instanceof Blob) ||
		body instanceof ArrayBuffer ||
		ArrayBuffer.isView(body) ||
		(typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
	);
}

export function resolveRequestBody(body: unknown): BodyInit | null | undefined {
	if (body === undefined || body === null) {
		return body;
	}
	if (isBodyInit(body)) {
		return body;
	}
	if (typeof body === "object") {
		return JSON.stringify(body);
	}
	return String(body);
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

/**
 * Request-bound replayable signatures are only reusable for byte-for-byte
 * equivalent requests, so the cache key needs the effective request shape.
 */
export async function createRequestFingerprint(request: Request): Promise<string> {
	const headerEntries = Array.from(request.headers.entries())
		.filter(
			([name]) =>
				name.toLowerCase() !== "signature" &&
				name.toLowerCase() !== "signature-input",
		)
		.sort(([left], [right]) => left.localeCompare(right));

	const bodyBytes =
		request.method === "GET" || request.method === "HEAD"
			? ""
			: bytesToHex(new Uint8Array(await request.clone().arrayBuffer()));

	return JSON.stringify({
		method: request.method,
		url: request.url,
		headers: headerEntries,
		body: bodyBytes,
	});
}

export function arraysEqual(left: string[], right: string[]): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

function entryToNormalizedSignOptions(
	entry: CachedSignature,
): AcceptSignatureSignOptions {
	if (entry.signOptions) {
		return normalizeAcceptSignatureSignOptions(entry.signOptions);
	}

	return normalizeAcceptSignatureSignOptions({
		binding:
			entry.binding ?? (entry.requestKey ? "request-bound" : "class-bound"),
		replay: "replayable",
		components: entry.components,
	});
}

function matchesCachedSignature(
	entry: CachedSignature,
	targetSignOptions: AcceptSignatureSignOptions,
	requestKey: string,
): boolean {
	const entryOptions = entryToNormalizedSignOptions(entry);

	if (entryOptions.replay !== targetSignOptions.replay) {
		return false;
	}

	if (targetSignOptions.binding === "request-bound") {
		return (
			entryOptions.binding === "request-bound" &&
			entry.requestKey === requestKey
		);
	}

	if (entryOptions.binding !== "class-bound") {
		return false;
	}

	return targetSignOptions.components.every((component) =>
		entryOptions.components.includes(component),
	);
}

export function buildFullUrl(base: string, path: string): string {
	if (path.startsWith("http")) {
		return path;
	}
	const normalizedBase = base.replace(/\/$/, "");
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	return `${normalizedBase}${normalizedPath}`;
}

function createLocalStorageAdapter(prefix: string): Erc8128SignatureStore {
	return {
		get(keyId) {
			try {
				const raw = localStorage.getItem(`${prefix}:sig:${keyId}`);
				if (!raw) {
					return null;
				}
				const parsed = JSON.parse(raw);
				return Array.isArray(parsed) ? parsed : [parsed];
			} catch {
				return null;
			}
		},
		set(keyId, entries) {
			try {
				localStorage.setItem(`${prefix}:sig:${keyId}`, JSON.stringify(entries));
			} catch {}
		},
		delete(keyId) {
			try {
				localStorage.removeItem(`${prefix}:sig:${keyId}`);
			} catch {}
		},
	};
}

export function resolveSignatureStore(
	options: ResolveStoreOptions,
): Erc8128SignatureStore | null {
	const raw = options.storage;
	if (raw === false) {
		return null;
	}
	if (typeof raw === "object") {
		return raw;
	}
	if (typeof localStorage !== "undefined") {
		return createLocalStorageAdapter(options.storagePrefix ?? "erc8128");
	}
	return null;
}

/**
 * Replayable signatures can be cached client-side and replayed as long as the
 * cached signature still matches the desired signing posture and has not
 * approached expiry.
 */
export async function signRequestWithCache(
	args: SignRequestWithCacheArgs,
): Promise<SignedRequestResult> {
	const { request, client, keyId, store, margin, signOptions } = args;
	const useCache = signOptions.replay === "replayable";
	const requestKey = useCache
		? await createRequestFingerprint(request.clone())
		: "";
	const now = Math.floor(Date.now() / 1000);
	let validEntries: CachedSignature[] | null = null;

	if (useCache && store) {
		const all = await store.get(keyId);
		if (all && all.length > 0) {
			validEntries = all.filter((entry) => entry.expires - margin > now);
			if (validEntries.length < all.length) {
				if (validEntries.length > 0) {
					await store.set(keyId, validEntries);
				} else {
					await store.delete(keyId);
					validEntries = null;
				}
			}

			const match = validEntries?.find((entry) =>
				matchesCachedSignature(entry, signOptions, requestKey),
			);
			if (match) {
				const headers = new Headers(request.headers);
				headers.set("signature", match.signature);
				headers.set("signature-input", match.signatureInput);
				return {
					headers,
					signature: match.signature,
					signatureInput: match.signatureInput,
				};
			}
		}
	}

	const signedReq = await client.signRequest(request.clone(), signOptions);
	const signature = signedReq.headers.get("signature");
	const signatureInput = signedReq.headers.get("signature-input");
	if (!signature || !signatureInput) {
		return {
			headers: new Headers(request.headers),
			signature: "",
			signatureInput: "",
		};
	}

	const parsedInput = parseSignatureInputHeader(signatureInput)[0];
	const headers = new Headers(request.headers);
	headers.set("signature", signature);
	headers.set("signature-input", signatureInput);

	if (useCache && store && parsedInput) {
		const entry: CachedSignature = {
			signature,
			signatureInput,
			expires: parsedInput.params.expires,
			signOptions,
			binding: signOptions.binding,
			requestKey:
				signOptions.binding === "request-bound" ? requestKey : undefined,
			components: parsedInput.components,
		};
		await store.set(keyId, [...(validEntries ?? []), entry]);
	}

	return { headers, signature, signatureInput };
}
