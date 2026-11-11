import type {
	BetterAuthOptions,
	GenericEndpointContext,
} from "@better-auth/core";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { PasskeyOptions } from "./types";

export function getRpID(options: PasskeyOptions, baseURL?: string | undefined) {
	return (
		options.rpID || (baseURL ? new URL(baseURL).hostname : "localhost") // default rpID
	);
}

/**
 * The origins a ceremony may come from, decided by server configuration so the
 * request cannot choose its verification target. Without an explicit `origin`,
 * that is the `baseURL` origin plus the origin the credential reports when
 * `trustedOrigins` lists it exactly, which keeps a frontend on another origin
 * working. A wildcard entry does not count, since it also admits sibling hosts
 * that can produce assertions for the same `rpID`. When a wildcard allowed host
 * covers the `rpID`, the request picks the `baseURL` host, so only the reported
 * origin counts, and only when the resolved trusted origins list it exactly.
 * Without a configured `baseURL` only the request URL is used, never
 * `x-forwarded-host`, which the client can set.
 *
 * @returns the expected origins, empty when the reported origin is not
 * trusted, or `null` when no server-side origin is configured
 *
 * @see https://www.w3.org/TR/webauthn-3/#sctn-validating-origin
 */
export function getExpectedOrigins(
	options: PasskeyOptions,
	ctx: GenericEndpointContext,
	clientDataJSON: unknown,
): string[] | null {
	if (options.origin) {
		const configured = Array.isArray(options.origin)
			? options.origin
			: [options.origin];
		return nonEmpty(configured.filter((origin) => origin.length > 0));
	}
	const reported = getReportedOrigin(clientDataJSON);
	if (
		"passkeyWildcardCoversRpID" in ctx.context &&
		ctx.context.passkeyWildcardCoversRpID
	) {
		return reported && ctx.context.trustedOrigins.includes(reported)
			? [reported]
			: [];
	}
	const baseOrigins = getServerOrigins(ctx);
	if (
		!reported ||
		baseOrigins.includes(reported) ||
		!ctx.context.trustedOrigins.includes(reported)
	) {
		return nonEmpty(baseOrigins);
	}
	return [...baseOrigins, reported];
}

function nonEmpty(origins: string[]) {
	return origins.length > 0 ? origins : null;
}

function getServerOrigins(ctx: GenericEndpointContext) {
	// Core rewrites `options.baseURL` per request, so read the flag set at init.
	if (
		"passkeyBaseURLFromRequest" in ctx.context &&
		ctx.context.passkeyBaseURLFromRequest
	) {
		return ctx.request ? [new URL(ctx.request.url).origin] : [];
	}
	return ctx.context.baseURL ? [new URL(ctx.context.baseURL).origin] : [];
}

function getReportedOrigin(clientDataJSON: unknown): string | null {
	if (typeof clientDataJSON !== "string") return null;
	const clientData = safeJSONParse<{ origin?: unknown }>(
		isoBase64URL.toUTF8String(clientDataJSON),
	);
	return typeof clientData?.origin === "string" ? clientData.origin : null;
}

/**
 * A wildcard allowed host can resolve to any sibling under a shared `rpID`,
 * and every sibling can produce assertions for it, so the request host cannot
 * stand in for the relying party's origin there.
 */
export function wildcardHostCoversRpID(
	options: PasskeyOptions,
	baseURL: BetterAuthOptions["baseURL"],
) {
	const rpID = options.rpID;
	if (!rpID || typeof baseURL !== "object") {
		return false;
	}
	return baseURL.allowedHosts.some((pattern) => {
		const hostname =
			pattern.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[:/]/)[0] ?? "";
		const wildcard = Math.max(
			hostname.lastIndexOf("*"),
			hostname.lastIndexOf("?"),
		);
		if (wildcard === -1) {
			return false;
		}
		const suffix = hostname.slice(wildcard + 1).replace(/^\./, "");
		return (
			!suffix ||
			suffix === rpID ||
			suffix.endsWith(`.${rpID}`) ||
			rpID.endsWith(`.${suffix}`)
		);
	});
}
