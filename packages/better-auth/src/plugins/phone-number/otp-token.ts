import type { GenericEndpointContext } from "@better-auth/core";
import {
	constantTimeEqual,
	symmetricDecrypt,
	symmetricEncrypt,
} from "../../crypto";
import type { PhoneNumberOptions } from "./types";
import { defaultKeyHasher } from "./utils";

/**
 * Transforms an OTP into the form persisted in the verification table.
 *
 * The value returned by `generateOTP` is what gets sent over SMS; only the
 * stored copy is transformed, so `storeOTP` never changes what the user types.
 */
export async function storeOTP(
	ctx: GenericEndpointContext,
	opts: PhoneNumberOptions,
	otp: string,
): Promise<string> {
	if (opts.storeOTP === "encrypted") {
		return await symmetricEncrypt({
			key: ctx.context.secretConfig,
			data: otp,
		});
	}
	if (opts.storeOTP === "hashed") {
		return await defaultKeyHasher(otp);
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
 * Checks a user-supplied OTP against the stored copy.
 *
 * Every branch ends in `constantTimeEqual` so the comparison does not leak the
 * shared prefix length of a wrong guess.
 */
export async function verifyStoredOTP(
	ctx: GenericEndpointContext,
	opts: PhoneNumberOptions,
	storedOtp: string,
	otp: string,
): Promise<boolean> {
	if (opts.storeOTP === "encrypted") {
		const decryptedOtp = await symmetricDecrypt({
			key: ctx.context.secretConfig,
			data: storedOtp,
		});
		return constantTimeEqual(decryptedOtp, otp);
	}
	if (opts.storeOTP === "hashed") {
		const hashedOtp = await defaultKeyHasher(otp);
		return constantTimeEqual(hashedOtp, storedOtp);
	}
	if (typeof opts.storeOTP === "object" && "hash" in opts.storeOTP) {
		const hashedOtp = await opts.storeOTP.hash(otp);
		return constantTimeEqual(hashedOtp, storedOtp);
	}
	if (typeof opts.storeOTP === "object" && "decrypt" in opts.storeOTP) {
		const decryptedOtp = await opts.storeOTP.decrypt(storedOtp);
		return constantTimeEqual(decryptedOtp, otp);
	}

	return constantTimeEqual(otp, storedOtp);
}
