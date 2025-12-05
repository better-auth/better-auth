import type { GenericEndpointContext } from "@better-auth/core";
import type { Account } from "@better-auth/core/db";
import type { InternalLogger } from "@better-auth/core/env";
import { safeJSONParse } from "@better-auth/core/utils";
import type { CookieOptions } from "better-call";
import * as z from "zod";
import { symmetricDecodeJWT, symmetricEncodeJWT } from "../crypto";

// Cookie size constants based on browser limits
const ALLOWED_COOKIE_SIZE = 4096;
// Estimated size of an empty cookie with all attributes
// (name, path, domain, secure, httpOnly, sameSite, expires/maxAge)
const ESTIMATED_EMPTY_COOKIE_SIZE = 200;
const CHUNK_SIZE = ALLOWED_COOKIE_SIZE - ESTIMATED_EMPTY_COOKIE_SIZE;

interface Cookie {
	name: string;
	value: string;
	options: CookieOptions;
}

type Chunks = Record<string, string>;

/**
 * Parse cookies from the request headers
 */
function parseCookiesFromContext(
	ctx: GenericEndpointContext,
): Record<string, string> {
	const cookieHeader = ctx.headers?.get("cookie");
	if (!cookieHeader) {
		return {};
	}

	const cookies: Record<string, string> = {};
	const pairs = cookieHeader.split("; ");

	for (const pair of pairs) {
		const [name, ...valueParts] = pair.split("=");
		if (name && valueParts.length > 0) {
			cookies[name] = valueParts.join("=");
		}
	}

	return cookies;
}

/**
 * Extract the chunk index from a cookie name
 */
function getChunkIndex(cookieName: string): number {
	const parts = cookieName.split(".");
	const lastPart = parts[parts.length - 1];
	const index = parseInt(lastPart || "0", 10);
	return isNaN(index) ? 0 : index;
}

/**
 * Read all existing chunks from cookies
 */
function readExistingChunks(
	cookieName: string,
	ctx: GenericEndpointContext,
): Chunks {
	const chunks: Chunks = {};
	const cookies = parseCookiesFromContext(ctx);

	for (const [name, value] of Object.entries(cookies)) {
		if (name.startsWith(cookieName)) {
			chunks[name] = value;
		}
	}

	return chunks;
}

/**
 * Get the full session data by joining all chunks
 */
function joinChunks(chunks: Chunks): string {
	const sortedKeys = Object.keys(chunks).sort((a, b) => {
		const aIndex = getChunkIndex(a);
		const bIndex = getChunkIndex(b);
		return aIndex - bIndex;
	});

	return sortedKeys.map((key) => chunks[key]).join("");
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
	const chunkCount = Math.ceil(cookie.value.length / CHUNK_SIZE);

	if (chunkCount === 1) {
		chunks[cookie.name] = cookie.value;
		return [cookie];
	}

	const cookies: Cookie[] = [];
	for (let i = 0; i < chunkCount; i++) {
		const name = `${cookie.name}.${i}`;
		const start = i * CHUNK_SIZE;
		const value = cookie.value.substring(start, start + CHUNK_SIZE);
		cookies.push({ ...cookie, name, value });
		chunks[name] = value;
	}

	logger.debug(`CHUNKING_${storeName.toUpperCase()}_COOKIE`, {
		message: `${storeName} cookie exceeds allowed ${ALLOWED_COOKIE_SIZE} bytes.`,
		emptyCookieSize: ESTIMATED_EMPTY_COOKIE_SIZE,
		valueSize: cookie.value.length,
		chunkCount,
		chunks: cookies.map((c) => c.value.length + ESTIMATED_EMPTY_COOKIE_SIZE),
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
			options: { ...cookieOptions, maxAge: 0 },
		};
	}
	return cleanedChunks;
}

/**
 * Create a session store for handling cookie chunking.
 * When session data exceeds 4KB, it automatically splits it into multiple cookies.
 *
 * Based on next-auth's SessionStore implementation.
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

		return {
			/**
			 * Get the full session data by joining all chunks
			 */
			getValue(): string {
				return joinChunks(chunks);
			},

			/**
			 * Check if there are existing chunks
			 */
			hasChunks(): boolean {
				return Object.keys(chunks).length > 0;
			},

			/**
			 * Chunk a cookie value and return all cookies to set (including cleanup cookies)
			 */
			chunk(value: string, options?: Partial<CookieOptions>): Cookie[] {
				// Start by cleaning all existing chunks
				const cleanedChunks = getCleanCookies(chunks, cookieOptions);
				// Clear the chunks object
				for (const name in chunks) {
					delete chunks[name];
				}
				const cookies: Record<string, Cookie> = cleanedChunks;

				// Create new chunks
				const chunked = chunkCookie(
					storeName,
					{
						name: cookieName,
						value,
						options: { ...cookieOptions, ...options },
					},
					chunks,
					logger,
				);

				// Update with new chunks
				for (const chunk of chunked) {
					cookies[chunk.name] = chunk;
				}

				return Object.values(cookies);
			},

			/**
			 * Get cookies to clean up all chunks
			 */
			clean(): Cookie[] {
				const cleanedChunks = getCleanCookies(chunks, cookieOptions);
				// Clear the chunks object
				for (const name in chunks) {
					delete chunks[name];
				}
				return Object.values(cleanedChunks);
			},

			/**
			 * Set all cookies in the context
			 */
			setCookies(cookies: Cookie[]): void {
				for (const cookie of cookies) {
					ctx.setCookie(cookie.name, cookie.value, cookie.options);
				}
			},
		};
	};

export const createSessionStore = storeFactory("Session");
const createAccountStore = storeFactory("Account");

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

	const cookies: Record<string, string> = {};
	const pairs = cookieHeader.split("; ");
	for (const pair of pairs) {
		const [name, ...valueParts] = pair.split("=");
		if (name && valueParts.length > 0) {
			cookies[name] = valueParts.join("=");
		}
	}

	for (const [name, val] of Object.entries(cookies)) {
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
		...accountDataCookie.options,
	};
	const data = await symmetricEncodeJWT(
		accountData,
		c.context.secret,
		"better-auth-account",
		options.maxAge,
	);

	if (data.length > ALLOWED_COOKIE_SIZE) {
		const accountStore = createAccountStore(accountDataCookie.name, options, c);

		const cookies = accountStore.chunk(data, options);
		accountStore.setCookies(cookies);
	} else {
		const accountStore = createAccountStore(accountDataCookie.name, options, c);
		if (accountStore.hasChunks()) {
			const cleanCookies = accountStore.clean();
			accountStore.setCookies(cleanCookies);
		}
		c.setCookie(accountDataCookie.name, data, options);
	}
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
				c.context.secret,
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
