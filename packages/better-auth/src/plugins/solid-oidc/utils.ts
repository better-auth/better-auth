import { createPlaceholderEmail } from "@better-auth/core/utils/email";

const HTTP_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * `fetch` that refuses HTTP redirects, used for server-side fetches whose URL
 * comes from a discovery document.
 *
 * Node reports the real 3xx status; spec-compliant runtimes (Cloudflare
 * Workers, Deno, browsers) return an opaque-redirect response with status 0, so
 * the status alone is not enough to detect one.
 */
export async function redirectRefusingFetch(
	url: string | URL,
	init?: RequestInit,
): Promise<Response> {
	const response = await fetch(url, { ...init, redirect: "manual" });
	if (
		response.type === "opaqueredirect" ||
		HTTP_REDIRECT_STATUSES.has(response.status)
	) {
		throw new Error(
			`The Solid endpoint "${String(url)}" returned an HTTP redirect. Server-side fetches refuse redirects to prevent SSRF.`,
		);
	}
	return response;
}

export function trimTrailingSlash(value: string) {
	return value.replace(/\/+$/, "");
}

async function sha256Hex(value: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Stable, non-routable address for a WebID.
 *
 * `User.email` is required and unique, but a Solid ID token carries no e-mail
 * claim. A WebID is a URI and cannot be an address local part, so it is hashed;
 * 128 bits keeps the local part inside the RFC 5321 limit with no realistic
 * collision. The address stays unverified, and `mapProfileToUser` can replace
 * it with a real one.
 */
export async function webIdPlaceholderEmail(webId: string) {
	return createPlaceholderEmail({
		identifier: (await sha256Hex(webId)).slice(0, 32),
		namespace: "solid",
	});
}
