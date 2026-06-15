import type { GenericEndpointContext } from "@better-auth/core";
import type { Account } from "@better-auth/core/db";
import type { InternalLogger } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import { safeJSONParse } from "@better-auth/core/utils/json";
import type { CookieOptions } from "better-call";
import * as z from "zod";
import { symmetricDecodeJWT, symmetricEncodeJWT } from "../crypto";
import {
	getMaxCookieValueSize,
	MAX_COOKIE_CHUNKS,
	MAX_COOKIE_SIZE,
	parseCookies,
} from "./cookie-utils";

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
	const chunkCount = Math.ceil(cookie.value.length / chunkSize);

	if (chunkCount <= 1) {
		chunks[cookie.name] = cookie.value;
		return [cookie];
	}

	if (chunkCount > MAX_COOKIE_CHUNKS) {
		throw new BetterAuthError(
			`${storeName} cookie requires ${chunkCount} chunks, exceeding the ${MAX_COOKIE_CHUNKS} chunk limit. Reduce the cached payload or use a database session.`,
		);
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
