import type { MiddlewareOptions, MiddlewareContext } from "better-call";
import type { AuthContext } from "../../init";
import { TRUST_DEVICE_COOKIE_NAME } from "./constant";
import type { TrustedDeviceTable } from "./types";
import { createHMAC } from "@better-auth/utils/hmac";

const DAYS_30 = 30 * 24 * 60 * 60;

async function getTrustedDeviceCookie(
	ctx: MiddlewareContext<
		MiddlewareOptions,
		AuthContext & { returned?: unknown; responseHeaders?: Headers }
	>,
) {
	const trustDeviceCookieName = ctx.context.createAuthCookie(
		TRUST_DEVICE_COOKIE_NAME,
	);
	const trustDeviceCookie = await ctx.getSignedCookie(
		trustDeviceCookieName.name,
		ctx.context.secret,
	);

	return trustDeviceCookie;
}

export async function isTrusted({
	ctx,
	newSession,
	trustedDeviceStrategy,
}: {
	ctx: MiddlewareContext<
		MiddlewareOptions,
		AuthContext & { returned?: unknown; responseHeaders?: Headers }
	>;
	newSession: NonNullable<AuthContext["newSession"]>;
	trustedDeviceStrategy: "in-cookie" | "in-db";
}): Promise<boolean> {
	const trustedDeviceCookie = await getTrustedDeviceCookie(ctx);
	if (trustedDeviceCookie === null) {
		return false;
	}

	if (trustedDeviceStrategy === "in-cookie") {
		return isTrustedInCookie(ctx, trustedDeviceCookie, newSession);
	}

	if (trustedDeviceStrategy === "in-db") {
		return isTrustedInDb(ctx, trustedDeviceCookie);
	}

	return false;
}

async function isTrustedInDb(
	ctx: MiddlewareContext<
		MiddlewareOptions,
		AuthContext & { returned?: unknown; responseHeaders?: Headers }
	>,
	trustedDeviceCookie: string,
): Promise<boolean> {
	const device = await ctx.context.adapter.findOne<TrustedDeviceTable>({
		model: "device",
		where: [
			{
				field: "id",
				value: trustedDeviceCookie,
			},
		],
	});

	if (device === null) {
		return false;
	}

	await ctx.context.adapter.update({
		model: "device",
		where: [
			{
				field: "id",
				value: device.deviceId,
			},
		],
		update: {
			maxAge: DAYS_30,
		},
	});

	const trustDeviceCookieName = ctx.context.createAuthCookie(
		TRUST_DEVICE_COOKIE_NAME,
	);

	await ctx.setSignedCookie(
		trustDeviceCookieName.name,
		device.deviceId,
		ctx.context.secret,
		trustDeviceCookieName.attributes,
	);

	return true;
}

async function isTrustedInCookie(
	ctx: MiddlewareContext<
		MiddlewareOptions,
		AuthContext & { returned?: unknown; responseHeaders?: Headers }
	>,
	trustedDeviceCookie: string,
	newSession: NonNullable<AuthContext["newSession"]>,
): Promise<boolean> {
	const [token, sessionToken] = trustedDeviceCookie.split("!");
	const expectedToken = await createHMAC("SHA-256", "base64urlnopad").sign(
		ctx.context.secret,
		`${newSession.user.id}!${sessionToken}`,
	);

	if (token !== expectedToken) {
		return false;
	}

	const trustDeviceCookieName = ctx.context.createAuthCookie(
		TRUST_DEVICE_COOKIE_NAME,
	);

	const newToken = await createHMAC("SHA-256", "base64urlnopad").sign(
		ctx.context.secret,
		`${newSession.user.id}!${sessionToken}`,
	);

	await ctx.setSignedCookie(
		trustDeviceCookieName.name,
		`${newToken}!${newSession.session.token}`,
		ctx.context.secret,
		trustDeviceCookieName.attributes,
	);

	return true;
}
