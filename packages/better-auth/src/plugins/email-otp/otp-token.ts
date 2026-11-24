import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import {
	constantTimeEqual,
	generateRandomString,
	symmetricDecrypt,
	symmetricEncrypt,
} from "../../crypto";
import { createOrFindVerification } from "../../db/verification";
import { getDate } from "../../utils/date";
import type { EmailOTPOptions, RequiredEmailOTPOptions } from "./types";
import { defaultKeyHasher, splitAtLastColon } from "./utils";

async function storeOTP(
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

export const defaultOTPGenerator = (options: EmailOTPOptions) =>
	generateRandomString(options.otpLength ?? 6, "0-9");

export async function issueOTP(
	ctx: GenericEndpointContext,
	opts: RequiredEmailOTPOptions,
	identifier: string,
	data: Parameters<RequiredEmailOTPOptions["generateOTP"]>[0],
): Promise<string> {
	const otp = opts.generateOTP(data, ctx) || defaultOTPGenerator(opts);
	const verification = {
		value: `${await storeOTP(ctx, opts, otp)}:0`,
		identifier,
		expiresAt: getDate(opts.expiresIn, "sec"),
	};
	await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
	const stored = await createOrFindVerification(ctx, verification);
	// A verification.create.before hook can veto the create by returning false.
	if (!stored) {
		throw APIError.from(
			"INTERNAL_SERVER_ERROR",
			BASE_ERROR_CODES.FAILED_TO_CREATE_VERIFICATION,
		);
	}
	if (stored.value === verification.value) return otp;

	const reused = await tryReuseOTP(ctx, opts, identifier);
	if (reused) return reused;
	await ctx.context.internalAdapter.updateVerificationByIdentifier(identifier, {
		value: verification.value,
		expiresAt: verification.expiresAt,
		createdAt: new Date(),
	});
	return otp;
}
