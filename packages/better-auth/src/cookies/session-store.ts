import type { GenericEndpointContext } from "@better-auth/core";
import type { Account } from "@better-auth/core/db";
import type { InternalLogger } from "@better-auth/core/env";
import { safeJSONParse } from "@better-auth/core/utils/json";
import type { CookieOptions } from "better-call";
import { serializeCookie } from "better-call";
import * as z from "zod";
import { symmetricDecodeJWT, symmetricEncodeJWT } from "../crypto";
import { parseCookies } from "./cookie-utils";

/**
 * Per-cookie byte ceiling.
 * Safari's ~4093 floor is the lowest among browsers.
 * Kept a little under it for attributes added after sizing.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc6265#section-6.1
 * @see https://github.com/dotnet/aspnetcore/blob/aa5493528640932601bb82ef3295e4d8ca7e11c5/src/Shared/ChunkingCookieManager/ChunkingCookieManager.cs#L40
 */
const MAX_COOKIE_SIZE = 4050;

/**
 * Max chunks per cookie.
 * A larger value does not belong in a cookie.
 */
const MAX_COOKIE_CHUNKS = 100;

/**
 * Largest value that keeps the serialized cookie within {@link MAX_COOKIE_SIZE},
 * measured with the real `serializeCookie` writer so it stays in sync with the
 * wire. Non-positive when the name and attributes alone overflow.
 */
function getMaxCookieValueSize(name: string, options: CookieOptions): number {
	// serializeCookie mutates options (e.g. forces `secure`), so copy them.
	const overhead = serializeCookie(name, "", { ...options }).length;
	return MAX_COOKIE_SIZE - overhead;
}

interface Cookie {
	name: string;
	value: string;
	attributes: CookieOptions;
}

type Chunks = Record<string, string>;

/**
 * Read all existing chunks from cookies
 */
function readExistingChunks(
	cookieName: string,
	ctx: GenericEndpointContext,
): Chunks {
	const chunks: Chunks = {};
	const cookies = parseCookies(ctx.headers?.get("cookie") || "");

	for (const [name, value] of cookies) {
		if (name.startsWith(cookieName)) {
			chunks[name] = value;
		}
	}

	return chunks;
}

/**
 * Split a cookie value into chunks if needed
 */
function chunkCookie(
	storeName: string,
	cookie: Cookie,
	chunks: Chunks,
	logger: InternalLogger,
): Cookie[] {
	// Size against the worst-case chunk name (highest index). A bare single
	// cookie only has more room.
	const chunkSize = getMaxCookieValueSize(
		`${cookie.name}.${MAX_COOKIE_CHUNKS - 1}`,
		cookie.attributes,
	);

	// No room for a value at all: fall into the skip branch below.
	const chunkCount =
		chunkSize > 0 ? Math.ceil(cookie.value.length / chunkSize) : Infinity;

	if (chunkCount <= 1) {
		chunks[cookie.name] = cookie.value;
		return [cookie];
	}

	if (chunkCount > MAX_COOKIE_CHUNKS) {
		// Skip the cache and fall back to the DB. The caller still expires stale chunks.
		logger.warn(
			`${storeName} cookie is too large to store even after chunking, so the cache was skipped. Reduce the cached data or use a database session.`,
		);
		return [];
	}

	const cookies: Cookie[] = [];
	for (let i = 0; i < chunkCount; i++) {
		const name = `${cookie.name}.${i}`;
		const start = i * chunkSize;
		const value = cookie.value.substring(start, start + chunkSize);
		cookies.push({ ...cookie, name, value });
		chunks[name] = value;
	}

	logger.debug(`CHUNKING_${storeName.toUpperCase()}_COOKIE`, {
		message: `${storeName} cookie exceeds the ${MAX_COOKIE_SIZE} byte limit and was split into ${chunkCount} chunks.`,
		valueSize: cookie.value.length,
		chunkCount,
		chunkSizes: cookies.map((c) => c.value.length),
	});

	return cookies;
}

/**
 * Get all cookies that should be cleaned (removed)
 */
function getCleanCookies(
	chunks: Chunks,
	cookieOptions: CookieOptions,
): Record<string, Cookie> {
	const cleanedChunks: Record<string, Cookie> = {};
	for (const name in chunks) {
		cleanedChunks[name] = {
			name,
			value: "",
			attributes: { ...cookieOptions, maxAge: 0 },
		};
	}
	return cleanedChunks;
}

/**
 * Store that splits a cookie into numbered chunks when its serialized form
 * would exceed the per-cookie byte limit, expiring stale chunks as needed.
 *
 * @see https://github.com/nextauthjs/next-auth/blob/27b2519b84b8eb9cf053775dea29d577d2aa0098/packages/next-auth/src/core/lib/cookie.ts
 */
const storeFactory =
	(storeName: string) =>
	(
		cookieName: string,
		cookieOptions: CookieOptions,
		ctx: GenericEndpointContext,
	) => {
		const chunks = readExistingChunks(cookieName, ctx);
		const logger = ctx.context.logger;

		// Expiry cookies for all current chunks. chunk() and clean() both start here.
		const expireExistingChunks = (): Record<string, Cookie> => {
			const expired = getCleanCookies(chunks, cookieOptions);
			for (const name in chunks) {
				delete chunks[name];
			}
			return expired;
		};

		return {
			chunk(value: string, options?: Partial<CookieOptions>): Cookie[] {
				const cookies = expireExistingChunks();
				const chunked = chunkCookie(
					storeName,
					{
						name: cookieName,
						value,
						attributes: { ...cookieOptions, ...options },
					},
					chunks,
					logger,
				);
				for (const chunk of chunked) {
					cookies[chunk.name] = chunk;
				}
				return Object.values(cookies);
			},

			clean(): Cookie[] {
				return Object.values(expireExistingChunks());
			},

			setCookies(cookies: Cookie[]): void {
				for (const cookie of cookies) {
					ctx.setCookie(cookie.name, cookie.value, cookie.attributes);
				}
			},
		};
	};

export const createSessionStore = storeFactory("Session");
export const createAccountStore = storeFactory("Account");

export function getChunkedCookie(
	ctx: GenericEndpointContext,
	cookieName: string,
): string | null {
	const value = ctx.getCookie(cookieName);
	if (value) {
		return value;
	}

	const chunks: Array<{ index: number; value: string }> = [];

	const cookieHeader = ctx.headers?.get("cookie");
	if (!cookieHeader) {
		return null;
	}

	for (const [name, val] of parseCookies(cookieHeader)) {
		if (name.startsWith(cookieName + ".")) {
			const parts = name.split(".");
			const indexStr = parts.at(-1);
			const index = parseInt(indexStr || "0", 10);
			if (!isNaN(index)) {
				chunks.push({ index, value: val });
			}
		}
	}

	if (chunks.length > 0) {
		chunks.sort((a, b) => a.index - b.index);
		return chunks.map((c) => c.value).join("");
	}

	return null;
}

export async function setAccountCookie(
	c: GenericEndpointContext,
	accountData: Record<string, any>,
) {
	const accountDataCookie = c.context.authCookies.accountData;
	const options = {
		maxAge: 60 * 5,
		...accountDataCookie.attributes,
	};
	const data = await symmetricEncodeJWT(
		accountData,
		c.context.secretConfig,
		"better-auth-account",
		options.maxAge,
	);

	const accountStore = createAccountStore(accountDataCookie.name, options, c);
	accountStore.setCookies(accountStore.chunk(data, options));
}

export async function getAccountCookie(c: GenericEndpointContext) {
	const accountCookie = getChunkedCookie(
		c,
		c.context.authCookies.accountData.name,
	);
	if (accountCookie) {
		const accountData = safeJSONParse<Account>(
			await symmetricDecodeJWT(
				accountCookie,
				c.context.secretConfig,
				"better-auth-account",
			),
		);
		if (accountData) {
			return accountData;
		}
	}

	return null;
}

export const getSessionQuerySchema = z.optional(
	z.object({
		/**
		 * If cookie cache is enabled, it will disable the cache
		 * and fetch the session from the database
		 */
		disableCookieCache: z.coerce
			.boolean()
			.meta({
				description: "Disable cookie cache and fetch session from database",
			})
			.optional(),
		disableRefresh: z.coerce
			.boolean()
			.meta({
				description:
					"Disable session refresh. Useful for checking session status, without updating the session",
			})
			.optional(),
	}),
);
