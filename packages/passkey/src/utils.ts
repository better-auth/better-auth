import type { GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
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
	return rpID;
}

/**
 * The RP ID(s) accepted when verifying a ceremony response. Defaults to the
 * RP ID sent in the options (`issuedRPID`, stored with the challenge). An
 * empty value is rejected rather than passed on, because
 * `@simplewebauthn/server` skips the RP ID check when it is falsy.
 */
export async function resolveExpectedRPID(
	options: PasskeyOptions,
	ctx: GenericEndpointContext,
	issuedRPID: string | undefined,
): Promise<string | string[]> {
	if (options.expectedRPID === undefined) {
		// Challenges stored before the RP ID was recorded fall back to resolving it.
		return issuedRPID || resolveRpID(options, ctx);
	}
	const expected =
		typeof options.expectedRPID === "function"
			? await options.expectedRPID({ ctx })
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
