import type {
	BetterAuthOptions,
	GenericEndpointContext,
} from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { PasskeyOptions } from "./types";

function getDefaultRpID(ctx: GenericEndpointContext) {
	const baseURL = ctx.context.options.baseURL;
	// Falls back when `baseURL` is unset or empty, as before.
	return typeof baseURL === "string" && baseURL
		? new URL(baseURL).hostname
		: "localhost";
}

export async function resolveRpID(
	options: PasskeyOptions,
	ctx: GenericEndpointContext,
): Promise<string> {
	const rpID =
		typeof options.rpID === "function"
			? await options.rpID({ ctx })
			: options.rpID || getDefaultRpID(ctx);
	if (!rpID) {
		throw new BetterAuthError("passkey: rpID resolved to an empty value");
	}
	return rpID;
}

/**
 * The RP ID(s) accepted when verifying a ceremony response. Defaults to the
 * RP ID sent in the options (`issuedRPID`, stored with the challenge; without
 * `rpID`, the one resolved again when verifying), which
 * is also passed to an `expectedRPID` function. An empty value is rejected
 * rather than passed on, because `@simplewebauthn/server` skips the RP ID
 * check when it is falsy.
 */
export async function resolveExpectedRPID(
	options: PasskeyOptions,
	ctx: GenericEndpointContext,
	issuedRPID: string,
): Promise<string | string[]> {
	if (options.expectedRPID === undefined) {
		return issuedRPID;
	}
	const expected =
		typeof options.expectedRPID === "function"
			? await options.expectedRPID({ ctx, rpID: issuedRPID })
			: options.expectedRPID;
	const list = (Array.isArray(expected) ? expected : [expected]).filter(
		Boolean,
	);
	if (!list.length) {
		throw new BetterAuthError(
			"passkey: expectedRPID resolved to an empty value",
		);
	}
	return list;
}

/**
 * The origins a ceremony may come from, decided by server configuration so the
 * request cannot choose its verification target. Without an explicit `origin`,
 * that is the `baseURL` origin plus the origin the credential reports when
 * `trustedOrigins` lists it exactly, which keeps a frontend on another origin
 * working. A wildcard entry does not count, since it also admits sibling hosts
 * that can produce assertions for the same `rpID`. When a wildcard allowed host
 * covers an RP ID the verifier accepts (the `rpID` issued with the challenge
 * when `rpID` is set, and every `expectedRPID`), the request picks the
 * `baseURL` host, so only the reported origin counts, and only when the
 * resolved trusted origins list it exactly.
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
	rpIDs: { issued: string; expected: string | string[] },
): string[] | null {
	if (options.origin) {
		const configured = Array.isArray(options.origin)
			? options.origin
			: [options.origin];
		return nonEmpty(configured.filter((origin) => origin.length > 0));
	}
	const reported = getReportedOrigin(clientDataJSON);
	// An unset `rpID` is derived from the `baseURL` of each request (with a
	// dynamic `baseURL`, its resolved host), so the issued RP ID is checked
	// only when `rpID` is set. `expectedRPID` widens what the
	// verifier accepts, so each of its values is checked too.
	const accepted = [
		...(options.rpID ? [rpIDs.issued] : []),
		...(options.expectedRPID !== undefined ? [rpIDs.expected].flat() : []),
	];
	const baseURL =
		"passkeyBaseURL" in ctx.context
			? (ctx.context.passkeyBaseURL as BetterAuthOptions["baseURL"])
			: undefined;
	if (accepted.some((rpID) => wildcardHostCoversRpID(rpID, baseURL))) {
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
	rpID: string | undefined,
	baseURL: BetterAuthOptions["baseURL"],
) {
	if (!rpID || typeof baseURL !== "object") {
		return false;
	}
	// Host names compare case-insensitively, and a trailing dot names the same host.
	const normalize = (host: string) => host.toLowerCase().replace(/\.$/, "");
	const host = normalize(rpID);
	return baseURL.allowedHosts.some((pattern) => {
		const hostname = normalize(
			pattern.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[:/]/)[0] ?? "",
		);
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
			suffix === host ||
			suffix.endsWith(`.${host}`) ||
			host.endsWith(`.${suffix}`)
		);
	});
}
