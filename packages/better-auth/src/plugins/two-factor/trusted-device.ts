import type { AuthContext } from "../../init";
import { TRUST_DEVICE_COOKIE_NAME } from "./constant";
import type { TrustedDeviceTable } from "./types";
import { createHMAC } from "@better-auth/utils/hmac";
import { generateId } from "../../utils";
import type { GenericEndpointContext, Session, User } from "../../types";
import { createAuthEndpoint } from "../../api/call";
import { sessionMiddleware } from "../../api";

const DAYS_30 = 30 * 24 * 60 * 60;

export async function getTrustedDeviceCookie(ctx: GenericEndpointContext) {
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
	ctx: GenericEndpointContext;
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
	ctx: GenericEndpointContext,
	trustedDeviceCookie: string,
): Promise<boolean> {
	const device = await ctx.context.adapter.findOne<TrustedDeviceTable>({
		model: "trustedDevice",
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

	if (device.expiresAt > Date.now()) {
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
			expiresAt: Date.now() + DAYS_30,
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
	ctx: GenericEndpointContext,
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

	const trustDeviceCookie = ctx.context.createAuthCookie(
		TRUST_DEVICE_COOKIE_NAME,
	);

	const newToken = await createHMAC("SHA-256", "base64urlnopad").sign(
		ctx.context.secret,
		`${newSession.user.id}!${sessionToken}`,
	);

	await ctx.setSignedCookie(
		trustDeviceCookie.name,
		`${newToken}!${newSession.session.token}`,
		ctx.context.secret,
		trustDeviceCookie.attributes,
	);

	return true;
}

export async function trustDevice({
	ctx,
	user,
	session,
	trustedDeviceStrategy,
}: {
	ctx: GenericEndpointContext;
	user: User;
	session: Session;
	trustedDeviceStrategy: "in-cookie" | "in-db";
}) {
	if (trustedDeviceStrategy === "in-db") {
		await trustDeviceInDb(ctx, session);
	}
	if (trustedDeviceStrategy === "in-cookie") {
		await trustDeviceInCookie(ctx, user, session);
	}
}

async function trustDeviceInDb(ctx: GenericEndpointContext, session: Session) {
	const deviceId = generateId(32);

	const device = await ctx.context.adapter.create<TrustedDeviceTable>({
		model: "device",
		data: {
			deviceId,
			userId: session.userId,
			expiresAt: Date.now() + DAYS_30,
			userAgent: session.userAgent,
		},
	});

	const trustDeviceCookie = ctx.context.createAuthCookie(
		TRUST_DEVICE_COOKIE_NAME,
	);

	await ctx.setSignedCookie(
		trustDeviceCookie.name,
		device.deviceId,
		ctx.context.secret,
		trustDeviceCookie.attributes,
	);
}

async function trustDeviceInCookie(
	ctx: GenericEndpointContext,
	user: User,
	session: Session,
) {
	const token = await createHMAC("SHA-256", "base64urlnopad").sign(
		ctx.context.secret,
		`${user.id}!${session.token}`,
	);

	const trustDeviceCookie = ctx.context.createAuthCookie(
		TRUST_DEVICE_COOKIE_NAME,
		{
			maxAge: DAYS_30,
		},
	);

	await ctx.setSignedCookie(
		trustDeviceCookie.name,
		`${token}!${session.token}`,
		ctx.context.secret,
		trustDeviceCookie.attributes,
	);
}

export const trustedDeviceDbEndpoints = {
	/**
	 * ### Endpoint
	 *
	 * GET `/two-factor/trusted-devices/list`
	 *
	 * ### API Methods
	 *
	 * **server:**
	 * `auth.api.listTrustedDevices`
	 *
	 * **client:**
	 * `authClient.twoFactor.listTrustedDevices`
	 */
	listTrustedDevices: createAuthEndpoint(
		"/two-factor/trusted-devices/list",
		{
			method: "GET",
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					summary: "List Trusted Devices",
					description:
						"Use this endpoint to list all the trusted devices the current user has.",
					responses: {
						200: {
							description: "Successful response",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											deviceId: {
												type: "string",
												description: "Device ID",
											},
											userAgent: {
												type: "string",
												description: "The user agent of the device.",
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const userId = ctx.context.session.user.id;

			const devices = await ctx.context.adapter.findMany<{
				deviceId: string;
				userAgent: string;
			}>({
				model: "trustedDevice",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});

			return devices;
		},
	),
	/**
	 * ### Endpoint
	 *
	 * POST `/two-factor/trusted-devices/remove/:deviceId`
	 *
	 * ### API Methods
	 *
	 * **server:**
	 * `auth.api.removeTrustedDevices`
	 *
	 * **client:**
	 * `authClient.twoFactor.listTrustedDevices`
	 */
	removeTrustedDevices: createAuthEndpoint(
		"/two-factor/trusted-devices/remove/:deviceId",
		{
			method: "POST",
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					summary: "Remove a Trusted Devices",
					description:
						"Use this endpoint to disable the device with the give id from being trusted.",
					responses: {
						200: {
							description: "Device removed",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											success: {
												type: "boolean",
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const deviceId = ctx.params.deviceId;
			const userId = ctx.context.session.user.id;

			await ctx.context.adapter.delete({
				model: "trustedDevice",
				where: [
					{
						field: "userId",
						value: userId,
					},
					{
						field: "deviceId",
						value: deviceId,
					},
				],
			});

			return { success: true };
		},
	),
};
