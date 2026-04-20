import type { GenericEndpointContext } from "@better-auth/core";
import { createHMAC } from "@better-auth/utils/hmac";
import { expireCookie } from "../../cookies";
import { generateRandomString } from "../../crypto/random";
import {
	TRUSTED_DEVICE_COOKIE_MAX_AGE,
	TRUSTED_DEVICE_COOKIE_NAME,
} from "./constant";

export type TrustedDeviceRotation = {
	maxAge: number;
	oldIdentifier: string;
	newIdentifier: string;
	newToken: string;
};

export async function resolveTrustedDeviceRotation(
	ctx: GenericEndpointContext,
	userId: string,
	maxAge = TRUSTED_DEVICE_COOKIE_MAX_AGE,
): Promise<TrustedDeviceRotation | null> {
	const trustDeviceCookie = ctx.context.createAuthCookie(
		TRUSTED_DEVICE_COOKIE_NAME,
		{
			maxAge,
		},
	);
	const trustedDeviceValue = await ctx.getSignedCookie(
		trustDeviceCookie.name,
		ctx.context.secret,
	);

	if (!trustedDeviceValue) {
		return null;
	}

	const [token, trustIdentifier] = trustedDeviceValue.split("!");
	if (!token || !trustIdentifier) {
		expireCookie(ctx, trustDeviceCookie);
		return null;
	}

	const expectedToken = await createHMAC("SHA-256", "base64urlnopad").sign(
		ctx.context.secret,
		`${userId}!${trustIdentifier}`,
	);

	if (token !== expectedToken) {
		expireCookie(ctx, trustDeviceCookie);
		return null;
	}

	const verificationRecord =
		await ctx.context.internalAdapter.findVerificationValue(trustIdentifier);
	if (
		verificationRecord?.value !== userId ||
		verificationRecord?.expiresAt <= new Date()
	) {
		expireCookie(ctx, trustDeviceCookie);
		return null;
	}

	const newIdentifier = `trust-device-${generateRandomString(32)}`;
	const newToken = await createHMAC("SHA-256", "base64urlnopad").sign(
		ctx.context.secret,
		`${userId}!${newIdentifier}`,
	);

	return {
		maxAge,
		oldIdentifier: trustIdentifier,
		newIdentifier,
		newToken,
	};
}

export async function rotateTrustedDevice(
	ctx: GenericEndpointContext,
	rotation: TrustedDeviceRotation,
	userId: string,
): Promise<void> {
	await ctx.context.internalAdapter.deleteVerificationByIdentifier(
		rotation.oldIdentifier,
	);
	await ctx.context.internalAdapter.createVerificationValue({
		value: userId,
		identifier: rotation.newIdentifier,
		expiresAt: new Date(Date.now() + rotation.maxAge * 1000),
	});
	const trustDeviceCookie = ctx.context.createAuthCookie(
		TRUSTED_DEVICE_COOKIE_NAME,
		{
			maxAge: rotation.maxAge,
		},
	);
	await ctx.setSignedCookie(
		trustDeviceCookie.name,
		`${rotation.newToken}!${rotation.newIdentifier}`,
		ctx.context.secret,
		trustDeviceCookie.attributes,
	);
}
