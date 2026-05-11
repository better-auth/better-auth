import { Agent } from "@atproto/api";
import type { OAuthSession } from "@atproto/oauth-client-node";
import type { AtprotoProfile } from "./types";

const PUBLIC_PROFILE_URL =
	"https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile";

/**
 * Returns true if the URL refers to a loopback address
 * (localhost, 127.0.0.1, or ::1).
 */
export function isLocalhost(url: string): boolean {
	try {
		const u = new URL(url);
		const host = u.hostname.replace(/^\[|\]$/g, "");
		return host === "localhost" || host === "127.0.0.1" || host === "::1";
	} catch {
		return false;
	}
}

/** Deterministic placeholder email for atproto users (atproto doesn't expose emails). */
export function atprotoPlaceholderEmail(did: string): string {
	return `${did.replace(/[^a-zA-Z0-9]/g, "_")}@atproto.invalid`;
}

/** Fetch the user's profile via an authenticated atproto Agent. */
export async function fetchProfileWithAgent(
	session: OAuthSession,
): Promise<AtprotoProfile> {
	try {
		const agent = new Agent(session);
		const res = await agent.getProfile({ actor: session.did });
		return {
			did: session.did,
			handle: res.data.handle,
			displayName: res.data.displayName,
			avatar: res.data.avatar,
			banner: res.data.banner,
			description: res.data.description,
		};
	} catch {
		return fetchAtprotoProfilePublic(session.did);
	}
}

/** Fallback profile fetch using the public Bluesky API. */
export async function fetchAtprotoProfilePublic(
	did: string,
): Promise<AtprotoProfile> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 5000);
	try {
		const res = await fetch(
			`${PUBLIC_PROFILE_URL}?actor=${encodeURIComponent(did)}`,
			{ signal: controller.signal },
		);
		if (res.ok) {
			const data = (await res.json()) as Partial<Record<string, string>>;
			return {
				did,
				handle: data.handle ?? did,
				displayName: data.displayName,
				avatar: data.avatar,
				banner: data.banner,
				description: data.description,
			};
		}
	} catch {
		// Best-effort — covers network errors and timeout aborts.
	} finally {
		clearTimeout(timer);
	}
	return { did, handle: did };
}

type BaseURLInput =
	| string
	| { allowedHosts?: readonly string[]; fallback?: string }
	| undefined;

/** Resolve a string baseURL from better-auth's BaseURL option, or throw with a clear message. */
export function resolveBaseURL(raw: BaseURLInput): string {
	if (!raw) {
		throw new Error("[atproto] better-auth baseURL is required");
	}
	if (typeof raw === "string") return raw;
	if (raw.fallback) return raw.fallback;
	throw new Error(
		"[atproto] better-auth baseURL must be a string or have a fallback URL",
	);
}
