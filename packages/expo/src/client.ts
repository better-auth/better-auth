import type {
	BetterAuthClientPlugin,
	ClientFetchOption,
	ClientStore,
} from "@better-auth/core";
import type { Session, User } from "@better-auth/core/db";
import { safeJSONParse } from "@better-auth/core/utils/json";
import {
	HOST_COOKIE_PREFIX,
	parseSetCookieHeader,
	SECURE_COOKIE_PREFIX,
	stripSecureCookiePrefix,
} from "better-auth/cookies/utils";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import type * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { setupExpoFocusManager } from "./focus-manager";
import { setupExpoOnlineManager } from "./online-manager";
import { PACKAGE_VERSION } from "./version";

if (Platform.OS !== "web") {
	setupExpoFocusManager();
	setupExpoOnlineManager();
}

/**
 * Storage used by the Expo client for cookies and cached session data.
 * Write coordination is scoped to the provided object, so reuse it across
 * clients that access the same stored data.
 */
export type ExpoClientStorage = Pick<
	typeof SecureStore,
	"setItem" | "setItemAsync" | "getItem" | "getItemAsync"
>;

interface ExpoClientOptions {
	scheme?: string | undefined;
	storage: ExpoClientStorage;
	/**
	 * Prefix for local storage keys (e.g., "my-app_cookie", "my-app_session_data")
	 * @default "better-auth"
	 */
	storagePrefix?: string | undefined;
	/**
	 * Prefix(es) for server cookie names to filter (e.g., "better-auth.session_token")
	 * This is used to identify which cookies belong to better-auth to prevent
	 * infinite refetching when third-party cookies are set.
	 * Can be a single string or an array of strings to match multiple prefixes.
	 * @default "better-auth"
	 * @example "better-auth"
	 * @example ["better-auth", "my-app"]
	 */
	cookiePrefix?: string | string[] | undefined;
	disableCache?: boolean | undefined;
	/**
	 * Options to customize the Expo web browser behavior when opening authentication
	 * sessions. These are passed directly to `expo-web-browser`'s
	 * `Browser.openBrowserAsync`.
	 *
	 * For example, on iOS you can use `{ preferEphemeralSession: true }` to prevent
	 * the authentication session from sharing cookies with the user's default
	 * browser session:
	 *
	 * ```ts
	 * const client = createClient({
	 *   expo: {
	 *     webBrowserOptions: {
	 *       preferEphemeralSession: true,
	 *     },
	 *   },
	 * });
	 * ```
	 */
	webBrowserOptions?: import("expo-web-browser").AuthSessionOpenOptions;
}

interface StoredCookie {
	value: string;
	expires: string | null;
}

function defineExpoClientPlugin<Plugin extends BetterAuthClientPlugin>(
	plugin: Plugin,
): Plugin {
	return plugin;
}

export function getSetCookie(header: string, prevCookie?: string | undefined) {
	const parsed = parseSetCookieHeader(header);
	const toSetCookie =
		safeJSONParse<Record<string, StoredCookie>>(prevCookie) ?? {};
	parsed.forEach((cookie, key) => {
		const expiresAt = cookie["expires"];
		const maxAge = cookie["max-age"];
		if (maxAge !== undefined && Number(maxAge) <= 0) {
			delete toSetCookie[key];
			return;
		}
		const expires = maxAge
			? new Date(Date.now() + Number(maxAge) * 1000)
			: expiresAt
				? new Date(String(expiresAt))
				: null;
		if (expires && expires.getTime() <= Date.now()) {
			delete toSetCookie[key];
			return;
		}
		toSetCookie[key] = {
			value: cookie["value"],
			expires: expires ? expires.toISOString() : null,
		};
	});
	return JSON.stringify(toSetCookie);
}

export function getCookie(cookie: string | null) {
	const parsed = safeJSONParse<Record<string, StoredCookie>>(cookie) ?? {};
	const toSend = Object.entries(parsed).reduce((acc, [key, value]) => {
		if (value.expires && new Date(value.expires) < new Date()) {
			return acc;
		}
		return acc ? `${acc}; ${key}=${value.value}` : `${key}=${value.value}`;
	}, "");
	return toSend;
}

function getOAuthStateValue(
	cookieJson: string | null,
	cookiePrefix: string | string[],
): string | null {
	if (!cookieJson) return null;

	const parsed = safeJSONParse<Record<string, StoredCookie>>(cookieJson);
	if (!parsed) return null;

	const prefixes = Array.isArray(cookiePrefix) ? cookiePrefix : [cookiePrefix];

	for (const prefix of prefixes) {
		// cookie strategy uses: <prefix>.oauth_state
		const candidates = [
			`${HOST_COOKIE_PREFIX}${prefix}.oauth_state`,
			`${SECURE_COOKIE_PREFIX}${prefix}.oauth_state`,
			`${prefix}.oauth_state`,
		];

		for (const name of candidates) {
			const value = parsed?.[name]?.value;
			if (value) return value;
		}
	}

	return null;
}

function getOrigin(scheme: string) {
	const schemeURI = Linking.createURL("", { scheme });
	return schemeURI;
}

/**
 * Compare if session cookies have actually changed by comparing their values.
 * Ignores expiry timestamps that naturally change on each request.
 *
 * @param prevCookie - Previous cookie JSON string
 * @param newCookie - New cookie JSON string
 * @returns true if session cookies have changed, false otherwise
 */
function hasSessionCookieChanged(
	prevCookie: string | null,
	newCookie: string,
): boolean {
	if (!prevCookie) return true;

	try {
		const prev = JSON.parse(prevCookie) as Record<string, StoredCookie>;
		const next = JSON.parse(newCookie) as Record<string, StoredCookie>;

		// Get all session-related cookie keys (session_token, session_data)
		const sessionKeys = new Set<string>();
		Object.keys(prev).forEach((key) => {
			if (key.includes("session_token") || key.includes("session_data")) {
				sessionKeys.add(key);
			}
		});
		Object.keys(next).forEach((key) => {
			if (key.includes("session_token") || key.includes("session_data")) {
				sessionKeys.add(key);
			}
		});

		// Compare the values of session cookies (ignore expires timestamps)
		for (const key of sessionKeys) {
			const prevValue = prev[key]?.value;
			const nextValue = next[key]?.value;
			if (prevValue !== nextValue) {
				return true;
			}
		}

		return false;
	} catch {
		// If parsing fails, assume cookie changed
		return true;
	}
}

/**
 * Check if the Set-Cookie header contains better-auth cookies.
 * This prevents infinite refetching when non-better-auth cookies (like third-party cookies) change.
 *
 * Supports multiple cookie naming patterns:
 * - Default: "better-auth.session_token", "better-auth-passkey", "__Secure-better-auth.session_token"
 * - Custom prefix: "myapp.session_token", "myapp-passkey", "__Secure-myapp.session_token"
 * - Custom full names: "my_custom_session_token", "custom_session_data"
 * - No prefix (cookiePrefix=""): matches any cookie with known suffixes
 * - Multiple prefixes: ["better-auth", "my-app"] matches cookies starting with any of the prefixes
 *
 * @param setCookieHeader - The Set-Cookie header value
 * @param cookiePrefix - The cookie prefix(es) to check for. Can be a string, array of strings, or empty string.
 * @returns true if the header contains better-auth cookies, false otherwise
 */
export function hasBetterAuthCookies(
	setCookieHeader: string,
	cookiePrefix: string | string[],
): boolean {
	const cookies = parseSetCookieHeader(setCookieHeader);
	const cookieSuffixes = ["session_token", "session_data"];
	const prefixes = Array.isArray(cookiePrefix) ? cookiePrefix : [cookiePrefix];

	// Check if any cookie is a better-auth cookie
	for (const name of cookies.keys()) {
		// Remove __Secure- prefix if present for comparison
		const nameWithoutSecure = stripSecureCookiePrefix(name);

		// Check against all provided prefixes
		for (const prefix of prefixes) {
			if (prefix) {
				// When prefix is provided, check if cookie starts with the prefix
				// This matches all better-auth cookies including session cookies, passkey cookies, etc.
				if (nameWithoutSecure.startsWith(prefix)) {
					return true;
				}
			} else {
				// When prefix is empty, check for common better-auth cookie patterns
				for (const suffix of cookieSuffixes) {
					if (nameWithoutSecure.endsWith(suffix)) {
						return true;
					}
				}
			}
		}
	}
	return false;
}

/**
 * Expo secure store does not support colons in the keys.
 * This function replaces colons with underscores.
 *
 * @see https://github.com/better-auth/better-auth/issues/5426
 *
 * @param name cookie name to be saved in the storage
 * @returns normalized cookie name
 */
export function normalizeCookieName(name: string) {
	return name.replace(/:/g, "_");
}

/**
 * Max characters written per `setItem`. Native secure stores silently reject
 * oversized writes (iOS Keychain refuses values above ~2KB), losing the cookie,
 * so a larger value is split across keys here. Mirrors the server's
 * `chunkCookie`/`joinChunks` in `session-store.ts`; keep the two in sync.
 *
 * @see https://github.com/better-auth/better-auth/issues/9151
 */
const STORAGE_VALUE_LIMIT = 1800;
const MAX_STORAGE_CHUNKS = 100;

/**
 * Marks a base key whose value is split across multiple storage keys. Legacy
 * markers contain only the chunk count. Current markers also identify the
 * active slot and retain the previous slot's chunk count for recovery.
 *
 * @see https://github.com/better-auth/better-auth/issues/11082
 */
const CHUNK_MARKER = "\u0001ba-chunks:";

type ChunkSlot = 0 | 1;

interface ChunkMarker {
	count: number;
	slot: ChunkSlot | null;
	fallbackCount: number | null;
}

function parseChunkCount(value: string | undefined): number | null {
	if (value === undefined) {
		return null;
	}
	const count = Number(value);
	if (!Number.isInteger(count) || count < 1 || count > MAX_STORAGE_CHUNKS) {
		return null;
	}
	return count;
}

function parseChunkMarker(baseValue: string): ChunkMarker | null {
	const parts = baseValue.slice(CHUNK_MARKER.length).split(":");
	if (parts.length > 3) {
		return null;
	}
	const [countValue, slotValue, fallbackCountValue] = parts;
	const count = parseChunkCount(countValue);
	if (count === null) {
		return null;
	}
	if (slotValue === undefined) {
		return fallbackCountValue === undefined
			? { count, slot: null, fallbackCount: null }
			: null;
	}
	if (slotValue !== "0" && slotValue !== "1") {
		return null;
	}
	const fallbackCount = parseChunkCount(fallbackCountValue);
	if (fallbackCountValue !== undefined && fallbackCount === null) {
		return null;
	}
	return {
		count,
		slot: slotValue === "0" ? 0 : 1,
		fallbackCount,
	};
}

function getChunkKey(key: string, marker: ChunkMarker, index: number) {
	return marker.slot === null
		? `${key}.${index}`
		: `${key}.${marker.slot}.${index}`;
}

function getOtherSlot(slot: ChunkSlot): ChunkSlot {
	return slot === 0 ? 1 : 0;
}

function serializeChunkMarker(marker: ChunkMarker) {
	if (marker.slot === null) {
		return `${CHUNK_MARKER}${marker.count}`;
	}
	const fallback =
		marker.fallbackCount === null ? "" : `:${marker.fallbackCount}`;
	return `${CHUNK_MARKER}${marker.count}:${marker.slot}${fallback}`;
}

function readChunks(
	storage: Pick<ExpoClientStorage, "getItem">,
	key: string,
	marker: ChunkMarker,
): string | null {
	let value = "";
	for (let i = 0; i < marker.count; i++) {
		const chunk = storage.getItem(getChunkKey(key, marker, i));
		if (chunk == null) {
			return null;
		}
		value += chunk;
	}
	return value;
}

async function readChunksAsync(
	storage: Pick<ExpoClientStorage, "getItemAsync">,
	key: string,
	marker: ChunkMarker,
): Promise<string | null> {
	let value = "";
	for (let i = 0; i < marker.count; i++) {
		const chunk = await storage.getItemAsync(getChunkKey(key, marker, i));
		if (chunk == null) {
			return null;
		}
		value += chunk;
	}
	return value;
}

function readStoredValue(
	storage: Pick<ExpoClientStorage, "getItem">,
	key: string,
	baseValue: string | null,
): string | null {
	if (baseValue == null || !baseValue.startsWith(CHUNK_MARKER)) {
		return baseValue;
	}
	const marker = parseChunkMarker(baseValue);
	if (!marker) {
		return null;
	}
	const value = readChunks(storage, key, marker);
	if (value !== null || marker.slot === null || marker.fallbackCount === null) {
		return value;
	}
	return readChunks(storage, key, {
		count: marker.fallbackCount,
		slot: getOtherSlot(marker.slot),
		fallbackCount: null,
	});
}

async function readStoredValueAsync(
	storage: Pick<ExpoClientStorage, "getItemAsync">,
	key: string,
	baseValue: string | null,
): Promise<string | null> {
	if (baseValue == null || !baseValue.startsWith(CHUNK_MARKER)) {
		return baseValue;
	}
	const marker = parseChunkMarker(baseValue);
	if (!marker) {
		return null;
	}
	const value = await readChunksAsync(storage, key, marker);
	if (value !== null || marker.slot === null || marker.fallbackCount === null) {
		return value;
	}
	return readChunksAsync(storage, key, {
		count: marker.fallbackCount,
		slot: getOtherSlot(marker.slot),
		fallbackCount: null,
	});
}

function getStorageWrites(
	key: string,
	value: string,
	currentBaseValue: string | null,
): [string, string][] {
	if (value.length <= STORAGE_VALUE_LIMIT) {
		return [[key, value]];
	}

	const count = Math.ceil(value.length / STORAGE_VALUE_LIMIT);
	if (count > MAX_STORAGE_CHUNKS) {
		throw new Error(
			`Storage value requires ${count} chunks, exceeding the limit of ${MAX_STORAGE_CHUNKS}`,
		);
	}
	const currentMarker = currentBaseValue?.startsWith(CHUNK_MARKER)
		? parseChunkMarker(currentBaseValue)
		: null;
	const slot: ChunkSlot = currentMarker?.slot === 0 ? 1 : 0;
	const marker: ChunkMarker = {
		count,
		slot,
		fallbackCount: currentMarker?.slot == null ? null : currentMarker.count,
	};
	const writes: [string, string][] = [];
	if (currentMarker?.slot != null && currentMarker.fallbackCount !== null) {
		// The fallback slot becomes the next write target.
		// Stop readers from using it until the new value is complete.
		writes.push([
			key,
			serializeChunkMarker({ ...currentMarker, fallbackCount: null }),
		]);
	}
	for (let i = 0; i < count; i++) {
		const start = i * STORAGE_VALUE_LIMIT;
		writes.push([
			getChunkKey(key, marker, i),
			value.slice(start, start + STORAGE_VALUE_LIMIT),
		]);
	}
	writes.push([key, serializeChunkMarker(marker)]);
	return writes;
}

function createKeyedWriteQueue() {
	const tails = new Map<string, Promise<unknown>>();
	return {
		pending(key: string): boolean {
			return tails.has(key);
		},
		enqueue<Result>(
			key: string,
			operation: () => Promise<Result>,
		): Promise<Result> {
			const previous = tails.get(key) ?? Promise.resolve();
			const queued = previous.then(operation, operation);
			tails.set(key, queued);

			const cleanup = () => {
				if (tails.get(key) === queued) {
					tails.delete(key);
				}
			};
			void queued.then(cleanup, cleanup);
			return queued;
		},
	};
}

const storageWriteQueues = new WeakMap<
	ExpoClientStorage,
	ReturnType<typeof createKeyedWriteQueue>
>();

function getStorageWriteQueue(storage: ExpoClientStorage) {
	const existing = storageWriteQueues.get(storage);
	if (existing) {
		return existing;
	}
	const queue = createKeyedWriteQueue();
	storageWriteQueues.set(storage, queue);
	return queue;
}

interface ExpoStorageAdapter {
	getItem(name: string): string | null;
	getItemAsync(name: string): Promise<string | null>;
	setItem(name: string, value: string): void;
	setItemAsync(name: string, value: string): Promise<void>;
}

interface StoredUpdate {
	previousValue: string | null;
	value: string;
}

function createManagedStorage(storage: ExpoClientStorage) {
	const writeQueue = getStorageWriteQueue(storage);
	const logWriteError = (key: string, error: unknown) => {
		console.error(
			`[better-auth/expo] failed to persist "${key}" to storage`,
			error,
		);
	};
	const getItem = (name: string): string | null => {
		const key = normalizeCookieName(name);
		return readStoredValue(storage, key, storage.getItem(key));
	};
	const getItemAsync = async (name: string): Promise<string | null> => {
		const key = normalizeCookieName(name);
		const baseValue = await storage.getItemAsync(key);
		return readStoredValueAsync(storage, key, baseValue);
	};
	const writeItem = (
		key: string,
		value: string,
		currentBaseValue: string | null,
	) => {
		for (const [writeKey, writeValue] of getStorageWrites(
			key,
			value,
			currentBaseValue,
		)) {
			storage.setItem(writeKey, writeValue);
		}
	};
	const writeItemAsync = async (
		key: string,
		value: string,
		currentBaseValue: string | null,
	) => {
		for (const [writeKey, writeValue] of getStorageWrites(
			key,
			value,
			currentBaseValue,
		)) {
			await storage.setItemAsync(writeKey, writeValue);
		}
	};
	const setItem = (name: string, value: string): void => {
		const key = normalizeCookieName(name);
		if (writeQueue.pending(key)) {
			logWriteError(
				key,
				new Error("Cannot write synchronously while an async write is pending"),
			);
			return;
		}
		try {
			const currentBaseValue =
				value.length > STORAGE_VALUE_LIMIT ? storage.getItem(key) : null;
			writeItem(key, value, currentBaseValue);
		} catch (error) {
			logWriteError(key, error);
		}
	};
	const setItemAsync = (name: string, value: string): Promise<void> => {
		const key = normalizeCookieName(name);
		return writeQueue.enqueue(key, async () => {
			try {
				const currentBaseValue =
					value.length > STORAGE_VALUE_LIMIT
						? await storage.getItemAsync(key)
						: null;
				await writeItemAsync(key, value, currentBaseValue);
			} catch (error) {
				logWriteError(key, error);
			}
		});
	};
	const updateItemAsync = (
		name: string,
		update: (currentValue: string | null) => string,
	): Promise<StoredUpdate | null> => {
		const key = normalizeCookieName(name);
		return writeQueue.enqueue(key, async () => {
			try {
				const currentBaseValue = await storage.getItemAsync(key);
				const previousValue = await readStoredValueAsync(
					storage,
					key,
					currentBaseValue,
				);
				const value = update(previousValue);
				await writeItemAsync(key, value, currentBaseValue);
				return { previousValue, value };
			} catch (error) {
				logWriteError(key, error);
				return null;
			}
		});
	};

	return { getItem, getItemAsync, setItem, setItemAsync, updateItemAsync };
}

/**
 * Wraps Expo storage with chunking, recoverable writes, and serialized async
 * updates.
 */
export function storageAdapter(storage: ExpoClientStorage): ExpoStorageAdapter {
	const managedStorage = createManagedStorage(storage);
	return {
		getItem: managedStorage.getItem,
		getItemAsync: managedStorage.getItemAsync,
		setItem: managedStorage.setItem,
		setItemAsync: managedStorage.setItemAsync,
	};
}

export const expoClient = (opts: ExpoClientOptions) => {
	let store: ClientStore | null = null;
	const storagePrefix = opts?.storagePrefix || "better-auth";
	const cookieName = `${storagePrefix}_cookie`;
	const localCacheName = `${storagePrefix}_session_data`;
	const storage = createManagedStorage(opts.storage);
	const isWeb = Platform.OS === "web";
	const cookiePrefix = opts?.cookiePrefix || "better-auth";
	let sessionCacheHydration: Promise<void> | undefined;
	const restoreSessionCache = async () => {
		if (isWeb || opts?.disableCache) {
			return;
		}

		const sessionAtom = store?.atoms.session;
		if (!sessionAtom) {
			return;
		}
		const initialSessionState = sessionAtom.get();
		if (initialSessionState.data !== null) {
			return;
		}

		const raw = await storage.getItemAsync(localCacheName);
		const cached = raw
			? safeJSONParse<{ user: User; session: Session }>(raw)
			: null;
		const expiresAt = cached?.session?.expiresAt;
		const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
		const fresh =
			!!cached?.user?.id && !!cached.session?.id && expiresAtMs > Date.now();
		if (fresh && sessionAtom.get() === initialSessionState) {
			sessionAtom.set({
				...initialSessionState,
				data: cached,
				error: null,
			});
		}
	};
	const hydrateSessionCache = () => {
		if (!sessionCacheHydration) {
			sessionCacheHydration = restoreSessionCache().catch((error) => {
				sessionCacheHydration = undefined;
				throw error;
			});
		}
		return sessionCacheHydration;
	};
	const clearSessionCache = async () => {
		await storage.setItemAsync(cookieName, "{}");
		store?.atoms.session?.set({
			...store.atoms.session.get(),
			data: null,
			error: null,
			isPending: false,
		});
		await storage.setItemAsync(localCacheName, "{}");
	};

	const rawScheme =
		opts?.scheme || Constants.expoConfig?.scheme || Constants.platform?.scheme;
	const scheme = Array.isArray(rawScheme) ? rawScheme[0] : rawScheme;

	if (!scheme && !isWeb) {
		throw new Error(
			"Scheme not found in app.json. Please provide a scheme in the options.",
		);
	}
	return defineExpoClientPlugin({
		id: "expo",
		version: PACKAGE_VERSION,
		getActions(_fetch: unknown, $store) {
			store = $store;
			return {
				/**
				 * Get the stored cookie.
				 *
				 * @example
				 * ```ts
				 * const cookie = await client.getCookie();
				 * fetch("https://api.example.com", {
				 * 	headers: {
				 * 		cookie,
				 * 	},
				 * });
				 * ```
				 */
				getCookie: async () => {
					const storedCookie = await storage.getItemAsync(cookieName);
					return getCookie(storedCookie);
				},
			};
		},
		fetchPlugins: [
			{
				id: "expo",
				name: "Expo",
				hooks: {
					async onSuccess(context) {
						if (isWeb) return;
						const { pathname } = new URL(context.request.url);
						const setCookie = context.response.headers.get("set-cookie");
						if (setCookie) {
							// Only process and notify if the Set-Cookie header contains better-auth cookies
							// This prevents infinite refetching when other cookies (like Cloudflare's __cf_bm) are present
							if (hasBetterAuthCookies(setCookie, cookiePrefix)) {
								const update = await storage.updateItemAsync(
									cookieName,
									(currentValue) =>
										getSetCookie(setCookie, currentValue ?? undefined),
								);
								// Only notify $sessionSignal if the session cookie values actually changed
								// This prevents infinite refetching when the server sends the same cookie with updated expiry
								if (
									update &&
									hasSessionCookieChanged(update.previousValue, update.value)
								) {
									store?.notify("$sessionSignal");
								}
							}
						}

						if (pathname.endsWith("/get-session") && !opts?.disableCache) {
							const data = context.data;
							await storage.setItemAsync(localCacheName, JSON.stringify(data));
						}
						if (pathname.endsWith("/sign-out")) {
							await clearSessionCache();
						}

						const isSignInRequest =
							pathname.endsWith("/sign-in") || pathname.includes("/sign-in/");
						const isLinkSocialRequest = pathname.endsWith("/link-social");
						if (
							context.data?.redirect &&
							(isSignInRequest || isLinkSocialRequest) &&
							!context.request?.body.includes("idToken") // id token is used for silent sign-in
						) {
							const callbackURL = JSON.parse(context.request.body)?.callbackURL;
							const to = callbackURL;
							const signInURL = context.data?.url;
							let Browser: typeof import("expo-web-browser") | undefined =
								undefined;
							try {
								Browser = await import("expo-web-browser");
							} catch {
								try {
									Browser = require("expo-web-browser");
								} catch (error) {
									throw new Error(
										'"expo-web-browser" is not installed as a dependency!',
										{
											cause: error,
										},
									);
								}
							}

							if (Platform.OS === "android") {
								try {
									Browser!.dismissAuthSession();
								} catch {}
							}

							const storedCookieJson = await storage.getItemAsync(cookieName);
							const oauthStateValue = getOAuthStateValue(
								storedCookieJson,
								cookiePrefix,
							);
							const params = new URLSearchParams({
								authorizationURL: signInURL,
							});
							if (oauthStateValue) {
								params.append("oauthState", oauthStateValue);
							}
							const proxyURL = `${context.request.baseURL}/expo-authorization-proxy?${params.toString()}`;
							const result = await Browser!.openAuthSessionAsync(
								proxyURL,
								to,
								opts?.webBrowserOptions,
							);
							if (result.type !== "success") return;
							const url = new URL(result.url);
							const cookie = url.searchParams.get("cookie");
							if (!cookie) return;
							const update = await storage.updateItemAsync(
								cookieName,
								(currentValue) =>
									getSetCookie(cookie, currentValue ?? undefined),
							);
							if (update) {
								store?.notify("$sessionSignal");
							}
						}
					},
				},
				async init(url, options) {
					if (isWeb) {
						return {
							url,
							options: options as ClientFetchOption,
						};
					}
					const { pathname } = new URL(url, options?.baseURL);
					if (pathname.endsWith("/get-session")) {
						await hydrateSessionCache();
					}
					options = options || {};
					options.credentials = "omit";
					/**
					 * ID token flow (native sign-in) doesn't need cookie-based auth.
					 * The ID token itself is cryptographically signed by the provider
					 * and validated server-side, so no session cookies or origin
					 * validation is required.
					 *
					 * Sending cookie/expo-origin headers for ID token requests triggers
					 * unnecessary origin checks that fail for custom URL schemes.
					 */
					const isIdTokenRequest = options.body?.idToken !== undefined;

					if (isIdTokenRequest) {
						const storedCookie = pathname.endsWith("/link-social")
							? await storage.getItemAsync(cookieName)
							: null;
						const cookie = getCookie(storedCookie);
						options.headers = {
							...options.headers,
							...(cookie ? { cookie } : {}),
							"x-skip-oauth-proxy": "true",
						};
					} else {
						const storedCookie = await storage.getItemAsync(cookieName);
						const cookie = getCookie(storedCookie);
						options.headers = {
							...options.headers,
							...(cookie ? { cookie } : {}),
							"expo-origin": getOrigin(scheme!),
							"x-skip-oauth-proxy": "true",
						};
						if (options.body?.callbackURL) {
							if (options.body.callbackURL.startsWith("/")) {
								const url = Linking.createURL(options.body.callbackURL);
								options.body.callbackURL = url;
							}
						}
						if (options.body?.newUserCallbackURL) {
							if (options.body.newUserCallbackURL.startsWith("/")) {
								const url = Linking.createURL(options.body.newUserCallbackURL);
								options.body.newUserCallbackURL = url;
							}
						}
						if (options.body?.errorCallbackURL) {
							if (options.body.errorCallbackURL.startsWith("/")) {
								const url = Linking.createURL(options.body.errorCallbackURL);
								options.body.errorCallbackURL = url;
							}
						}
						if (pathname.endsWith("/sign-out")) {
							await clearSessionCache();
						}
					}
					return {
						url,
						options: options as ClientFetchOption,
					};
				},
			},
		],
	});
};

export { parseSetCookieHeader } from "better-auth/cookies/utils";
export * from "./focus-manager";
export * from "./online-manager";
