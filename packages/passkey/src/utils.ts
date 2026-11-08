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
	return typeof baseURL === "string" ? new URL(baseURL).hostname : "localhost";
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
	if (typeof options.rpID === "function") {
		// Core rewrites options.baseURL per request; validate against the
		// original allowed hosts captured on this auth instance at init.
		const baseURL =
			"passkeyBaseURL" in ctx.context
				? (ctx.context.passkeyBaseURL as BetterAuthOptions["baseURL"])
				: ctx.context.options.baseURL;
		assertOriginForWildcardHosts({ ...options, rpID }, baseURL);
	}
	return rpID;
}

/**
 * The RP ID(s) accepted when verifying a ceremony response. Defaults to the
 * RP ID sent in the options (`issuedRPID`, stored with the challenge), which
 * is also passed to an `expectedRPID` function. An empty value is rejected
 * rather than passed on, because `@simplewebauthn/server` skips the RP ID
 * check when it is falsy.
 */
export async function resolveExpectedRPID(
	options: PasskeyOptions,
	ctx: GenericEndpointContext,
	issuedRPID: string | undefined,
): Promise<string | string[]> {
	// Challenges stored before the RP ID was recorded fall back to resolving it.
	const getIssuedRPID = async () => issuedRPID || resolveRpID(options, ctx);
	if (options.expectedRPID === undefined) {
		return getIssuedRPID();
	}
	const expected =
		typeof options.expectedRPID === "function"
			? await options.expectedRPID({ ctx, rpID: await getIssuedRPID() })
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
 * that can produce assertions for the same `rpID`. Without a configured `baseURL` only the request URL is used, never
 * `x-forwarded-host`, which the client can set.
 *
 * @see https://www.w3.org/TR/webauthn-3/#sctn-validating-origin
 */
export function getExpectedOrigins(
	options: PasskeyOptions,
	ctx: GenericEndpointContext,
	clientDataJSON: unknown,
) {
	if (options.origin) {
		const configured = Array.isArray(options.origin)
			? options.origin
			: [options.origin];
		return configured.filter((origin) => origin.length > 0);
	}
	const baseOrigins = getServerOrigins(ctx);
	const reported = getReportedOrigin(clientDataJSON);
	if (
		!reported ||
		baseOrigins.includes(reported) ||
		!ctx.context.trustedOrigins.includes(reported)
	) {
		return baseOrigins;
	}
	return [...baseOrigins, reported];
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
export function assertOriginForWildcardHosts(
	options: PasskeyOptions,
	baseURL: BetterAuthOptions["baseURL"],
) {
	// A resolver needs a request and is checked after resolveRpID runs.
	const rpID = typeof options.rpID === "string" ? options.rpID : undefined;
	if (options.origin || !rpID || typeof baseURL !== "object") {
		return;
	}
	const coversRpID = baseURL.allowedHosts.some((pattern) => {
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
	if (!coversRpID) {
		return;
	}
	throw new BetterAuthError(
		`Passkey \`origin\` must be set when a wildcard in \`baseURL.allowedHosts\` covers the passkey \`rpID\` "${rpID}".`,
	);
}
