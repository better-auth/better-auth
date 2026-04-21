import type { GenericEndpointContext } from "@better-auth/core";
import { createHMAC } from "@better-auth/utils/hmac";
import { expireCookie } from "../../cookies";
import { generateRandomString } from "../../crypto/random";
import {
	TRUSTED_DEVICE_COOKIE_MAX_AGE,
	TRUSTED_DEVICE_COOKIE_NAME,
} from "./constant";
import type { TrustedDevice } from "./types";
import { defaultKeyHasher } from "./utils";

export type TrustedDeviceRotation = {
	deviceId: string;
	maxAge: number;
	currentLookupKeyHash: string;
	nextLookupKey: string;
	nextLookupKeyHash: string;
	nextToken: string;
};

async function signLookupKey(
	ctx: GenericEndpointContext,
	userId: string,
	lookupKey: string,
): Promise<string> {
	return createHMAC("SHA-256", "base64urlnopad").sign(
		ctx.context.secret,
		`${userId}!${lookupKey}`,
	);
}

async function hashLookupKey(lookupKey: string): Promise<string> {
	return defaultKeyHasher(lookupKey);
}

async function parseTrustedDeviceCookie(
	ctx: GenericEndpointContext,
): Promise<{ token: string; lookupKey: string } | null> {
	const trustDeviceCookie = ctx.context.createAuthCookie(
		TRUSTED_DEVICE_COOKIE_NAME,
	);
	const trustedDeviceValue = await ctx.getSignedCookie(
		trustDeviceCookie.name,
		ctx.context.secret,
	);

	if (!trustedDeviceValue) {
		return null;
	}

	const [token, lookupKey] = trustedDeviceValue.split("!");
	if (!token || !lookupKey) {
		expireCookie(ctx, trustDeviceCookie);
		return null;
	}

	return { token, lookupKey };
}

function expireTrustedDeviceCookie(ctx: GenericEndpointContext): void {
	expireCookie(ctx, ctx.context.createAuthCookie(TRUSTED_DEVICE_COOKIE_NAME));
}

export async function issueTrustedDevice(
	ctx: GenericEndpointContext,
	userId: string,
): Promise<void> {
	const plugin = ctx.context.getPlugin("two-factor");
	const maxAge =
		(plugin?.options as { trustDevice?: { maxAge?: number } } | undefined)
			?.trustDevice?.maxAge ?? TRUSTED_DEVICE_COOKIE_MAX_AGE;
	const lookupKey = generateRandomString(32);
	const lookupKeyHash = await hashLookupKey(lookupKey);
	const token = await signLookupKey(ctx, userId, lookupKey);
	const trustedDeviceCookie = ctx.context.createAuthCookie(
		TRUSTED_DEVICE_COOKIE_NAME,
		{ maxAge },
	);

	await ctx.context.adapter.create({
		model: "trustedDevice",
		data: {
			userId,
			lookupKeyHash,
			label: null,
			userAgent: ctx.request?.headers.get("user-agent") ?? null,
			lastUsedAt: new Date(),
			expiresAt: new Date(Date.now() + maxAge * 1000),
		},
	});

	await ctx.setSignedCookie(
		trustedDeviceCookie.name,
		`${token}!${lookupKey}`,
		ctx.context.secret,
		trustedDeviceCookie.attributes,
	);
}

export async function resolveTrustedDeviceRotation(
	ctx: GenericEndpointContext,
	userId: string,
	maxAge = TRUSTED_DEVICE_COOKIE_MAX_AGE,
): Promise<TrustedDeviceRotation | null> {
	const parsed = await parseTrustedDeviceCookie(ctx);
	if (!parsed) {
		return null;
	}

	const expectedToken = await signLookupKey(ctx, userId, parsed.lookupKey);
	if (parsed.token !== expectedToken) {
		expireTrustedDeviceCookie(ctx);
		return null;
	}

	const lookupKeyHash = await hashLookupKey(parsed.lookupKey);
	const trustedDevice = await ctx.context.adapter.findOne<TrustedDevice>({
		model: "trustedDevice",
		where: [
			{ field: "userId", value: userId },
			{ field: "lookupKeyHash", value: lookupKeyHash },
		],
	});

	if (!trustedDevice || trustedDevice.expiresAt <= new Date()) {
		expireTrustedDeviceCookie(ctx);
		return null;
	}

	const nextLookupKey = generateRandomString(32);
	return {
		deviceId: trustedDevice.id,
		maxAge,
		currentLookupKeyHash: lookupKeyHash,
		nextLookupKey,
		nextLookupKeyHash: await hashLookupKey(nextLookupKey),
		nextToken: await signLookupKey(ctx, userId, nextLookupKey),
	};
}

export async function rotateTrustedDevice(
	ctx: GenericEndpointContext,
	rotation: TrustedDeviceRotation,
	userId: string,
): Promise<void> {
	const updated = await ctx.context.adapter.update({
		model: "trustedDevice",
		where: [
			{ field: "id", value: rotation.deviceId },
			{ field: "userId", value: userId },
			{ field: "lookupKeyHash", value: rotation.currentLookupKeyHash },
		],
		update: {
			lookupKeyHash: rotation.nextLookupKeyHash,
			lastUsedAt: new Date(),
			expiresAt: new Date(Date.now() + rotation.maxAge * 1000),
		},
	});

	if (!updated) {
		expireTrustedDeviceCookie(ctx);
		return;
	}

	const trustDeviceCookie = ctx.context.createAuthCookie(
		TRUSTED_DEVICE_COOKIE_NAME,
		{
			maxAge: rotation.maxAge,
		},
	);
	await ctx.setSignedCookie(
		trustDeviceCookie.name,
		`${rotation.nextToken}!${rotation.nextLookupKey}`,
		ctx.context.secret,
		trustDeviceCookie.attributes,
	);
}

export async function listTrustedDevices(
	ctx: GenericEndpointContext,
	userId: string,
): Promise<Array<TrustedDevice & { isCurrent: boolean }>> {
	const parsedCookie = await parseTrustedDeviceCookie(ctx);
	const currentLookupKeyHash = parsedCookie
		? await hashLookupKey(parsedCookie.lookupKey)
		: null;
	const devices = await ctx.context.adapter.findMany<TrustedDevice>({
		model: "trustedDevice",
		where: [{ field: "userId", value: userId }],
		sortBy: {
			field: "createdAt",
			direction: "desc",
		},
	});

	return devices.map((device) => ({
		...device,
		isCurrent: device.lookupKeyHash === currentLookupKeyHash,
	}));
}

export async function revokeTrustedDevice(
	ctx: GenericEndpointContext,
	userId: string,
	deviceId: string,
): Promise<boolean> {
	const parsedCookie = await parseTrustedDeviceCookie(ctx);
	const currentLookupKeyHash = parsedCookie
		? await hashLookupKey(parsedCookie.lookupKey)
		: null;
	const device = await ctx.context.adapter.findOne<TrustedDevice>({
		model: "trustedDevice",
		where: [
			{ field: "id", value: deviceId },
			{ field: "userId", value: userId },
		],
	});

	if (!device) {
		return false;
	}

	await ctx.context.adapter.delete({
		model: "trustedDevice",
		where: [
			{ field: "id", value: deviceId },
			{ field: "userId", value: userId },
		],
	});

	if (currentLookupKeyHash && device.lookupKeyHash === currentLookupKeyHash) {
		expireTrustedDeviceCookie(ctx);
	}

	return true;
}

export async function revokeAllTrustedDevices(
	ctx: GenericEndpointContext,
	userId: string,
): Promise<void> {
	await ctx.context.adapter.deleteMany({
		model: "trustedDevice",
		where: [{ field: "userId", value: userId }],
	});
	expireTrustedDeviceCookie(ctx);
}
