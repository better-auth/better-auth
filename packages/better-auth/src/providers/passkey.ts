import { RequiredDeep } from "type-fest";
import { Provider } from ".";
import { createAuthEndpoint } from "../api/call";
import { getSessionFromCtx } from "../api/routes";
import { z } from "zod";
import type {
	AuthenticationResponseJSON,
	AuthenticatorTransportFuture,
	CredentialDeviceType,
	PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/types";
import { sessionMiddleware } from "../api/middlewares/session";
import { alphabet, generateRandomString } from "oslo/crypto";
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";

export interface PasskeyOptions {
	/**
	 * A unique identifier for your website. 'localhost' is okay for
	 * local dev
	 */
	rpID: string;
	/**
	 * Human-readable title for your website
	 */
	rpName: string;
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

export type WebAuthnCookieType = {
	expectedChallenge: string;
	userData: { id: string; email: string };
};

export type Passkey = {
	id: string;
	publicKey: string;
	userId: string;
	webauthnUserID: string;
	counter: number;
	deviceType: CredentialDeviceType;
	backedUp: boolean;
	transports?: string;
	createdAt: Date;
};

export const passkey = (options: PasskeyOptions) => {
	const opts: RequiredDeep<PasskeyOptions> = {
		origin: null,
		...options,
		rpID: process.env.NODE_ENV === "development" ? "localhost" : options.rpID,
		advanced: {
			webAuthnChallengeCookie: "better-auth-passkey",
			...options.advanced,
		},
	};
	const webAuthnChallengeCookieExpiration = 1000 * 60 * 60 * 24; // 24 hours
	return {
		id: "passkey",
		type: "custom",
		endpoints: {
			generatePasskeyRegistrationOptions: createAuthEndpoint(
				"/passkey/generate-register",
				{
					method: "GET",
					use: [sessionMiddleware],
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
						rpName: opts.rpName,
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
					/**
					 * set challenge on cookies
					 */
					const data: WebAuthnCookieType = {
						expectedChallenge: options.challenge,
						userData: {
							...session.user,
							email: session.user.email || session.user.id,
						},
					};

					await ctx.setSignedCookie(
						opts.advanced.webAuthnChallengeCookie,
						JSON.stringify(data),
						ctx.context.options.secret,
						{
							secure: true,
							httpOnly: true,
							sameSite: "lax",
							maxAge: webAuthnChallengeCookieExpiration,
						},
					);
					return ctx.json(options, {
						status: 200,
					});
				},
			),
			generatePasskeyAuthenticationOptions: createAuthEndpoint(
				"/passkey/generate-authenticate",
				{
					method: "GET",
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
					/**
					 * set challenge on cookies
					 */
					const data: WebAuthnCookieType = {
						expectedChallenge: options.challenge,
						userData: {
							email: session?.user.email || session?.user.id || "",
							id: session?.user.id || "",
						},
					};
					await ctx.setSignedCookie(
						opts.advanced.webAuthnChallengeCookie,
						JSON.stringify(data),
						ctx.context.options.secret,
						{
							secure: true,
							httpOnly: true,
							sameSite: "lax",
							maxAge: webAuthnChallengeCookieExpiration,
						},
					);
					return ctx.json(options, {
						status: 200,
					});
				},
			),
			verifyPasskey: createAuthEndpoint(
				"/verify/passkey",
				{
					method: "POST",
					body: z.object({
						response: z.any(),
						type: z.enum(["register", "authenticate"]),
					}),
				},
				async (ctx) => {
					const origin = options.origin || ctx.headers?.get("origin") || "";
					if (!origin) {
						return ctx.json(null, {
							status: 400,
						});
					}
					const isRegister = ctx.body.type === "register";
					const session = await getSessionFromCtx(ctx);
					const resp = ctx.body.response;

					const challengeString = await ctx.getSignedCookie(
						opts.advanced.webAuthnChallengeCookie,
						ctx.context.options.secret,
					);
					if (!challengeString) {
						return ctx.json(null, {
							status: 400,
						});
					}
					const { userData, expectedChallenge } = JSON.parse(
						challengeString,
					) as WebAuthnCookieType;

					if (isRegister) {
						const verification = await verifyRegistrationResponse({
							response: resp,
							expectedChallenge,
							expectedOrigin: origin,
							expectedRPID: options.rpID,
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
						const userID = generateRandomString(32, alphabet("a-z", "0-9"));
						const newPasskey: Passkey = {
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
					}

					AuthenticatorResponse;
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
						return ctx.json(null, {
							status: 400,
						});
					}
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
					if (!verified) return ctx.json(null, { status: 401 });

					await ctx.context.adapter.update<Passkey>({
						model: "passkey",
						where: [
							{
								field: "id",
								value: passkey.id,
							},
						],
						update: {
							counter: passkey.counter + 1,
						},
					});
					const s = await ctx.context.internalAdapter.createSession(
						passkey.userId,
					);
					await ctx.setSignedCookie(
						ctx.context.authCookies.sessionToken.name,
						s.id,
						ctx.context.options.secret,
						ctx.context.authCookies.sessionToken.options,
					);
					const user = await ctx.context.internalAdapter.findUserById(
						passkey.userId,
					);
					return ctx.json(
						{
							user,
						},
						{
							status: 200,
						},
					);
				},
			),
		},
		schema: {
			passkey: {
				fields: {
					publicKey: {
						type: "string",
					},
					userId: {
						type: "string",
						references: {
							model: "user",
							field: "id",
						},
					},
					webauthnUserID: {
						type: "string",
					},
					counter: {
						type: "number",
					},
					deviceType: {
						type: "string",
					},
					backedUp: {
						type: "boolean",
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
	} satisfies Provider;
};
