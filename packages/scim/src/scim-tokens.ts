import type { GenericEndpointContext } from "better-auth";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { defaultKeyHasher } from "better-auth/plugins";
import type { SCIMOptions } from "./types";

export async function storeSCIMToken(
	ctx: GenericEndpointContext,
	opts: SCIMOptions,
	scimToken: string,
) {
	if (opts.storeSCIMToken === "encrypted") {
		return await symmetricEncrypt({
			key: ctx.context.secret,
			data: scimToken,
		});
	}
	if (opts.storeSCIMToken === "hashed") {
		return await defaultKeyHasher(scimToken);
	}
	if (
		typeof opts.storeSCIMToken === "object" &&
		"hash" in opts.storeSCIMToken
	) {
		return await opts.storeSCIMToken.hash(scimToken);
	}
	if (
		typeof opts.storeSCIMToken === "object" &&
		"encrypt" in opts.storeSCIMToken
	) {
		return await opts.storeSCIMToken.encrypt(scimToken);
	}

	return scimToken;
}

export async function verifySCIMToken(
	ctx: GenericEndpointContext,
	opts: SCIMOptions,
	storedSCIMToken: string,
	scimToken: string,
): Promise<boolean> {
	if (opts.storeSCIMToken === "encrypted") {
		return (
			(await symmetricDecrypt({
				key: ctx.context.secret,
				data: storedSCIMToken,
			})) === scimToken
		);
	}
	if (opts.storeSCIMToken === "hashed") {
		const hashedOtp = await defaultKeyHasher(scimToken);
		return hashedOtp === storedSCIMToken;
	}
	if (
		typeof opts.storeSCIMToken === "object" &&
		"hash" in opts.storeSCIMToken
	) {
		const hashedOtp = await opts.storeSCIMToken.hash(scimToken);
		return hashedOtp === storedSCIMToken;
	}
	if (
		typeof opts.storeSCIMToken === "object" &&
		"decrypt" in opts.storeSCIMToken
	) {
		const decryptedOtp = await opts.storeSCIMToken.decrypt(storedSCIMToken);
		return decryptedOtp === scimToken;
	}

	return scimToken === storedSCIMToken;
}
