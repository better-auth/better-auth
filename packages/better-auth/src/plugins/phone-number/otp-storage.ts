import type { GenericEndpointContext } from "@better-auth/core";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import {
	constantTimeEqual,
	symmetricDecrypt,
	symmetricEncrypt,
} from "../../crypto";
import type { PhoneNumberOptions } from "./types";

/**
 * Splits a stored verification value into the stored OTP and the attempt count.
 *
 * The counter is appended after the last colon, so the OTP portion can be
 * hashed or encrypted without hiding the counter.
 */
export function splitStoredOTP(input: string): [string, string] {
	const idx = input.lastIndexOf(":");
	if (idx === -1) {
		return [input, ""];
	}
	return [input.slice(0, idx), input.slice(idx + 1)];
}

export const defaultOTPHasher = async (otp: string) => {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(otp),
	);
	return base64Url.encode(new Uint8Array(hash), { padding: false });
};

/**
 * Transforms an OTP into the value persisted in the verification record,
 * according to the plugin's `storeOTP` option.
 */
export async function storeOTP(
	ctx: GenericEndpointContext,
	opts: PhoneNumberOptions,
	otp: string,
) {
	if (opts.storeOTP === "encrypted") {
		return await symmetricEncrypt({
			key: ctx.context.secretConfig,
			data: otp,
		});
	}
	if (opts.storeOTP === "hashed") {
		return await defaultOTPHasher(otp);
	}
	if (typeof opts.storeOTP === "object" && "hash" in opts.storeOTP) {
		return await opts.storeOTP.hash(otp);
	}
	if (typeof opts.storeOTP === "object" && "encrypt" in opts.storeOTP) {
		return await opts.storeOTP.encrypt(otp);
	}

	return otp;
}

/**
 * Compares a user-provided OTP with the value stored in the verification
 * record, reversing whichever transformation `storeOTP` applied.
 */
export async function verifyStoredOTP(
	ctx: GenericEndpointContext,
	opts: PhoneNumberOptions,
	storedOTP: string,
	otp: string,
): Promise<boolean> {
	if (opts.storeOTP === "encrypted") {
		const decryptedOTP = await symmetricDecrypt({
			key: ctx.context.secretConfig,
			data: storedOTP,
		});
		return constantTimeEqual(decryptedOTP, otp);
	}
	if (opts.storeOTP === "hashed") {
		const hashedOTP = await defaultOTPHasher(otp);
		return constantTimeEqual(hashedOTP, storedOTP);
	}
	if (typeof opts.storeOTP === "object" && "hash" in opts.storeOTP) {
		const hashedOTP = await opts.storeOTP.hash(otp);
		return constantTimeEqual(hashedOTP, storedOTP);
	}
	if (typeof opts.storeOTP === "object" && "decrypt" in opts.storeOTP) {
		const decryptedOTP = await opts.storeOTP.decrypt(storedOTP);
		return constantTimeEqual(decryptedOTP, otp);
	}

	return constantTimeEqual(otp, storedOTP);
}
