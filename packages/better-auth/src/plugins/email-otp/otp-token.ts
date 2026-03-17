import type { GenericEndpointContext } from "@better-auth/core";
import {
	constantTimeEqual,
	symmetricDecrypt,
	symmetricEncrypt,
} from "../../crypto";
import { getDate } from "../../utils/date";
import type { EmailOTPOptions, RequiredEmailOTPOptions } from "./types";
import { defaultKeyHasher, splitAtLastColon } from "./utils";

export async function storeOTP(
	ctx: GenericEndpointContext,
	opts: EmailOTPOptions,
	otp: string,
) {
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

export async function verifyStoredOTP(
	ctx: GenericEndpointContext,
	opts: EmailOTPOptions,
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

/**
 * Retrieves the plain-text OTP from a stored value.
 * Returns `null` if the OTP is hashed and cannot be recovered.
 */
async function retrieveOTP(
	ctx: GenericEndpointContext,
	opts: EmailOTPOptions,
	storedOtp: string,
): Promise<string | null> {
	if (opts.storeOTP === "plain" || opts.storeOTP === undefined) {
		return storedOtp;
	}
	if (opts.storeOTP === "encrypted") {
		return await symmetricDecrypt({
			key: ctx.context.secretConfig,
			data: storedOtp,
		});
	}
	if (typeof opts.storeOTP === "object" && "decrypt" in opts.storeOTP) {
		return await opts.storeOTP.decrypt(storedOtp);
	}
	// hashed or custom hash -> cannot recover
	return null;
}

/**
 * Tries to reuse an existing unexpired OTP.
 * Returns the plain-text OTP if reusable, `null` otherwise.
 */
export async function tryReuseOTP(
	ctx: GenericEndpointContext,
	opts: RequiredEmailOTPOptions,
	identifier: string,
): Promise<string | null> {
	const existing =
		await ctx.context.internalAdapter.findVerificationValue(identifier);
	if (!existing || existing.expiresAt < new Date()) return null;

	const [storedOtpValue, attempts] = splitAtLastColon(existing.value);
	const allowedAttempts = opts.allowedAttempts || 3;
	if (attempts && parseInt(attempts) >= allowedAttempts) return null;

	const plainOtp = await retrieveOTP(ctx, opts, storedOtpValue);
	if (!plainOtp) return null;

	await ctx.context.internalAdapter.updateVerificationByIdentifier(identifier, {
		expiresAt: getDate(opts.expiresIn, "sec"),
	});

	return plainOtp;
}
