import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
	AuthenticationResponseJSON,
	AuthenticatorTransportFuture,
	CredentialDeviceType,
	PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/types";
import { APIError } from "better-call";
import { alphabet, generateRandomString } from "../../crypto/random";
import { z } from "zod";
import { createAuthEndpoint } from "../../api/call";
import { sessionMiddleware } from "../../api";
import { getSessionFromCtx } from "../../api/routes";
import type { BetterAuthPlugin } from "../../types/plugins";
import { setSessionCookie } from "../../cookies";
import { BetterAuthError } from "../../error/better-auth-error";
import { generateId } from "../../utils/id";

interface WebAuthnChallengeValue {
	expectedChallenge: string;
	userData: {
		id: string;
	};
}

export interface PasskeyOptions {
	/**
	 * A unique identifier for your website. 'localhost' is okay for
	 * local dev
	 *
	 * @default "localhost"
	 */
	rpID?: string;
	/**
	 * Human-readable title for your website
	 *
	 * @default "Better Auth"
	 */
	rpName?: string;
	/**
	 * The URL at which registrations and authentications should occur.
	 * 'http://localhost' and 'http://localhost:PORT' are also valid.
	 * Do NOT include any trailing /
	 *
	 * if this isn't provided. The client itself will
	 * pass this value.
	 */
	origin?: string | null;
	/**
	 * Advanced options
	 */
	advanced?: {
		webAuthnChallengeCookie?: string;
	};
}

export type Passkey = {
	id: string;
	name?: string;
	publicKey: string;
	userId: string;
	webauthnUserID: string;
	counter: number;
	deviceType: CredentialDeviceType;
	backedUp: boolean;
	transports?: string;
	createdAt: Date;
};

export const passkey = (options?: PasskeyOptions) => {
	const baseURL = process.env.BETTER_AUTH_URL;
	const rpID =
		options?.rpID ||
		baseURL?.replace("http://", "").replace("https://", "").split(":")[0] ||
		"localhost";
	if (!rpID) {
		throw new BetterAuthError(
			"passkey rpID not found. Please provide a rpID in the options or set the BETTER_AUTH_URL environment variable.",
		);
	}
	const opts = {
		origin: null,
		...options,
		rpID,
		advanced: {
			webAuthnChallengeCookie: "better-auth-passkey",
			...options?.advanced,
		},
	};
	const expirationTime = new Date(Date.now() + 1000 * 60 * 5);
	const currentTime = new Date();
	const maxAgeInSeconds = Math.floor(
		(expirationTime.getTime() - currentTime.getTime()) / 1000,
	);
	return {
		id: "passkey",
		endpoints: {
			generatePasskeyRegistrationOptions: createAuthEndpoint(
				"/passkey/generate-register-options",
				{
					method: "GET",
					use: [sessionMiddleware],
					metadata: {
						client: false,
					},
				},
				async (ctx) => {
					const session = ctx.context.session;
					const userPasskeys = await ctx.context.adapter.findMany<Passkey>({
						model: "passkey",
						where: [
							{
								field: "userId",
								value: session.user.id,
							},
						],
					});
					const userID = new Uint8Array(
						Buffer.from(generateRandomString(32, alphabet("a-z", "0-9"))),
					);
					let options: PublicKeyCredentialCreationOptionsJSON;
					options = await generateRegistrationOptions({
						rpName: opts.rpName || ctx.context.appName,
						rpID: opts.rpID,
						userID,
						userName: session.user.email || session.user.id,
						attestationType: "none",
						excludeCredentials: userPasskeys.map((passkey) => ({
							id: passkey.id,
							transports: passkey.transports?.split(
								",",
							) as AuthenticatorTransportFuture[],
						})),
						authenticatorSelection: {
							residentKey: "preferred",
							userVerification: "preferred",
							authenticatorAttachment: "platform",
						},
					});

					const id = generateId();
					await ctx.setSignedCookie(
						opts.advanced.webAuthnChallengeCookie,
						id,
						ctx.context.secret,
						{
							secure: true,
							httpOnly: true,
							sameSite: "lax",
							maxAge: maxAgeInSeconds,
						},
					);
					await ctx.context.internalAdapter.createVerificationValue({
						identifier: id,
						value: JSON.stringify({
							expectedChallenge: options.challenge,
							userData: {
								id: session.user.id,
							},
						}),
						expiresAt: expirationTime,
					});
					return ctx.json(options, {
						status: 200,
					});
				},
			),
			generatePasskeyAuthenticationOptions: createAuthEndpoint(
				"/passkey/generate-authenticate-options",
				{
					method: "POST",
					body: z
						.object({
							email: z.string().optional(),
						})
						.optional(),
				},
				async (ctx) => {
					const session = await getSessionFromCtx(ctx);
					let userPasskeys: Passkey[] = [];
					if (session) {
						userPasskeys = await ctx.context.adapter.findMany<Passkey>({
							model: "passkey",
							where: [
								{
									field: "userId",
									value: session.user.id,
								},
							],
						});
					}
					const options = await generateAuthenticationOptions({
						rpID: opts.rpID,
						userVerification: "preferred",
						...(userPasskeys.length
							? {
									allowCredentials: userPasskeys.map((passkey) => ({
										id: passkey.id,
										transports: passkey.transports?.split(
											",",
										) as AuthenticatorTransportFuture[],
									})),
								}
							: {}),
					});
					const data = {
						expectedChallenge: options.challenge,
						userData: {
							id: session?.user.id || "",
						},
					};
					const id = generateId();
					await ctx.setSignedCookie(
						opts.advanced.webAuthnChallengeCookie,
						id,
						ctx.context.secret,
						{
							secure: true,
							httpOnly: true,
							sameSite: "lax",
							maxAge: maxAgeInSeconds,
						},
					);
					await ctx.context.internalAdapter.createVerificationValue({
						identifier: id,
						value: JSON.stringify(data),
						expiresAt: expirationTime,
					});
					return ctx.json(options, {
						status: 200,
					});
				},
			),
			verifyPasskeyRegistration: createAuthEndpoint(
				"/passkey/verify-registration",
				{
					method: "POST",
					body: z.object({
						response: z.any(),
						name: z.string().optional(),
					}),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const origin = options?.origin || ctx.headers?.get("origin") || "";
					if (!origin) {
						return ctx.json(null, {
							status: 400,
						});
					}
					const resp = ctx.body.response;
					const challengeId = await ctx.getSignedCookie(
						opts.advanced.webAuthnChallengeCookie,
						ctx.context.secret,
					);
					if (!challengeId) {
						throw new APIError("BAD_REQUEST", {
							message: "Challenge not found",
						});
					}

					const data =
						await ctx.context.internalAdapter.findVerificationValue(
							challengeId,
						);
					if (!data) {
						return ctx.json(null, {
							status: 400,
						});
					}
					const { expectedChallenge, userData } = JSON.parse(
						data.value,
					) as WebAuthnChallengeValue;

					if (userData.id !== ctx.context.session.user.id) {
						throw new APIError("UNAUTHORIZED", {
							message: "You are not authorized to register this passkey",
						});
					}

					try {
						const verification = await verifyRegistrationResponse({
							response: resp,
							expectedChallenge,
							expectedOrigin: origin,
							expectedRPID: options?.rpID,
						});
						const { verified, registrationInfo } = verification;
						if (!verified || !registrationInfo) {
							return ctx.json(null, {
								status: 400,
							});
						}
						const {
							credentialID,
							credentialPublicKey,
							counter,
							credentialDeviceType,
							credentialBackedUp,
						} = registrationInfo;
						const pubKey = Buffer.from(credentialPublicKey).toString("base64");
						const userID = generateId();
						const newPasskey: Passkey = {
							name: ctx.body.name,
							userId: userData.id,
							webauthnUserID: userID,
							id: credentialID,
							publicKey: pubKey,
							counter,
							deviceType: credentialDeviceType,
							transports: resp.response.transports.join(","),
							backedUp: credentialBackedUp,
							createdAt: new Date(),
						};
						const newPasskeyRes = await ctx.context.adapter.create<Passkey>({
							model: "passkey",
							data: newPasskey,
						});
						return ctx.json(newPasskeyRes, {
							status: 200,
						});
					} catch (e) {
						console.log(e);
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Failed to verify registration",
						});
					}
				},
			),
			verifyPasskeyAuthentication: createAuthEndpoint(
				"/passkey/verify-authentication",
				{
					method: "POST",
					body: z.object({
						response: z.any(),
					}),
				},
				async (ctx) => {
					const origin = options?.origin || ctx.headers?.get("origin") || "";
					if (!origin) {
						throw new APIError("BAD_REQUEST", {
							message: "origin missing",
						});
					}
					const resp = ctx.body.response;
					const challengeId = await ctx.getSignedCookie(
						opts.advanced.webAuthnChallengeCookie,
						ctx.context.secret,
					);
					if (!challengeId) {
						throw new APIError("BAD_REQUEST", {
							message: "Challenge not found",
						});
					}

					const data =
						await ctx.context.internalAdapter.findVerificationValue(
							challengeId,
						);
					if (!data) {
						throw new APIError("BAD_REQUEST", {
							message: "Challenge not found",
						});
					}
					const { expectedChallenge } = JSON.parse(
						data.value,
					) as WebAuthnChallengeValue;
					const passkey = await ctx.context.adapter.findOne<Passkey>({
						model: "passkey",
						where: [
							{
								field: "id",
								value: resp.id,
							},
						],
					});
					if (!passkey) {
						throw new APIError("UNAUTHORIZED", {
							message: "Passkey not found",
						});
					}
					try {
						const verification = await verifyAuthenticationResponse({
							response: resp as AuthenticationResponseJSON,
							expectedChallenge,
							expectedOrigin: origin,
							expectedRPID: opts.rpID,
							authenticator: {
								credentialID: passkey.id,
								credentialPublicKey: new Uint8Array(
									Buffer.from(passkey.publicKey, "base64"),
								),
								counter: passkey.counter,
								transports: passkey.transports?.split(
									",",
								) as AuthenticatorTransportFuture[],
							},
						});
						const { verified } = verification;
						if (!verified)
							throw new APIError("UNAUTHORIZED", {
								message: "Authentication failed",
							});

						await ctx.context.adapter.update<Passkey>({
							model: "passkey",
							where: [
								{
									field: "id",
									value: passkey.id,
								},
							],
							update: {
								counter: verification.authenticationInfo.newCounter,
							},
						});
						const s = await ctx.context.internalAdapter.createSession(
							passkey.userId,
							ctx.request,
						);
						if (!s) {
							throw new APIError("INTERNAL_SERVER_ERROR", {
								message: "Unable to create session",
							});
						}
						await setSessionCookie(ctx, s.id);
						return ctx.json(
							{
								session: s,
							},
							{
								status: 200,
							},
						);
					} catch (e) {
						ctx.context.logger.error(e);
						throw new APIError("BAD_REQUEST", {
							message: "Failed to verify authentication",
						});
					}
				},
			),
			listPasskeys: createAuthEndpoint(
				"/passkey/list-user-passkeys",
				{
					method: "GET",
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const passkeys = await ctx.context.adapter.findMany<Passkey>({
						model: "passkey",
						where: [{ field: "userId", value: ctx.context.session.user.id }],
					});
					return ctx.json(passkeys, {
						status: 200,
					});
				},
			),
			deletePasskey: createAuthEndpoint(
				"/passkey/delete-passkey",
				{
					method: "POST",
					body: z.object({
						id: z.string(),
					}),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					await ctx.context.adapter.delete<Passkey>({
						model: "passkey",
						where: [
							{
								field: "id",
								value: ctx.body.id,
							},
						],
					});
					return ctx.json(null, {
						status: 200,
					});
				},
			),
		},
		schema: {
			passkey: {
				fields: {
					name: {
						type: "string",
						required: false,
					},
					publicKey: {
						type: "string",
						required: true,
					},
					userId: {
						type: "string",
						references: {
							model: "user",
							field: "id",
						},
						required: true,
					},
					webauthnUserID: {
						type: "string",
						required: true,
					},
					counter: {
						type: "number",
						required: true,
					},
					deviceType: {
						type: "string",
						required: true,
					},
					backedUp: {
						type: "boolean",
						required: true,
					},
					transports: {
						type: "string",
						required: false,
					},
					createdAt: {
						type: "date",
						defaultValue: new Date(),
						required: false,
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
};

export * from "./client";
