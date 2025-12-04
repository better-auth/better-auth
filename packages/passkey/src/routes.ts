import { createAuthEndpoint } from "@better-auth/core/api";
import { base64 } from "@better-auth/utils/base64";
import type {
	AuthenticationResponseJSON,
	AuthenticatorTransportFuture,
	PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/server";
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { generateId } from "better-auth";
import {
	freshSessionMiddleware,
	getSessionFromCtx,
	sessionMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { APIError } from "better-call";
import * as z from "zod";
import { PASSKEY_ERROR_CODES } from "./error-codes";
import type { Passkey, PasskeyOptions, WebAuthnChallengeValue } from "./types";
import { getRpID } from "./utils";

type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

type RequiredPassKeyOptions = WithRequired<PasskeyOptions, "advanced"> & {
	advanced: Required<PasskeyOptions["advanced"]>;
};

const generatePasskeyQuerySchema = z
	.object({
		authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
		name: z.string().optional(),
	})
	.optional();

export const generatePasskeyRegistrationOptions = (
	opts: RequiredPassKeyOptions,
	{
		maxAgeInSeconds,
		expirationTime,
	}: { maxAgeInSeconds: number; expirationTime: Date },
) =>
	createAuthEndpoint(
		"/passkey/generate-register-options",
		{
			method: "GET",
			use: [freshSessionMiddleware],
			query: generatePasskeyQuerySchema,
			metadata: {
				openapi: {
					operationId: "generatePasskeyRegistrationOptions",
					description: "Generate registration options for a new passkey",
					responses: {
						200: {
							description: "Success",
							parameters: {
								query: {
									authenticatorAttachment: {
										description: `Type of authenticator to use for registration.
                          "platform" for device-specific authenticators,
                          "cross-platform" for authenticators that can be used across devices.`,
										required: false,
									},
									name: {
										description: `Optional custom name for the passkey.
                          This can help identify the passkey when managing multiple credentials.`,
										required: false,
									},
								},
							},
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											challenge: {
												type: "string",
											},
											rp: {
												type: "object",
												properties: {
													name: {
														type: "string",
													},
													id: {
														type: "string",
													},
												},
											},
											user: {
												type: "object",
												properties: {
													id: {
														type: "string",
													},
													name: {
														type: "string",
													},
													displayName: {
														type: "string",
													},
												},
											},
											pubKeyCredParams: {
												type: "array",
												items: {
													type: "object",
													properties: {
														type: {
															type: "string",
														},
														alg: {
															type: "number",
														},
													},
												},
											},
											timeout: {
												type: "number",
											},
											excludeCredentials: {
												type: "array",
												items: {
													type: "object",
													properties: {
														id: {
															type: "string",
														},
														type: {
															type: "string",
														},
														transports: {
															type: "array",
															items: {
																type: "string",
															},
														},
													},
												},
											},
											authenticatorSelection: {
												type: "object",
												properties: {
													authenticatorAttachment: {
														type: "string",
													},
													requireResidentKey: {
														type: "boolean",
													},
													userVerification: {
														type: "string",
													},
												},
											},
											attestation: {
												type: "string",
											},

											extensions: {
												type: "object",
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
			const { session } = ctx.context;
			const userPasskeys = await ctx.context.adapter.findMany<Passkey>({
				model: "passkey",
				where: [
					{
						field: "userId",
						value: session.user.id,
					},
				],
			});
			const userID = new TextEncoder().encode(
				generateRandomString(32, "a-z", "0-9"),
			);
			let options: PublicKeyCredentialCreationOptionsJSON;
			options = await generateRegistrationOptions({
				rpName: opts.rpName || ctx.context.appName,
				rpID: getRpID(opts, ctx.context.options.baseURL),
				userID,
				userName: ctx.query?.name || session.user.email || session.user.id,
				userDisplayName: session.user.email || session.user.id,
				attestationType: "none",
				excludeCredentials: userPasskeys.map((passkey) => ({
					id: passkey.credentialID,
					transports: passkey.transports?.split(
						",",
					) as AuthenticatorTransportFuture[],
				})),
				authenticatorSelection: {
					residentKey: "preferred",
					userVerification: "preferred",
					...(opts.authenticatorSelection || {}),
					...(ctx.query?.authenticatorAttachment
						? {
								authenticatorAttachment: ctx.query.authenticatorAttachment,
							}
						: {}),
				},
			});
			const id = generateId(32);
			const webAuthnCookie = ctx.context.createAuthCookie(
				opts.advanced.webAuthnChallengeCookie,
			);
			await ctx.setSignedCookie(webAuthnCookie.name, id, ctx.context.secret, {
				...webAuthnCookie.attributes,
				maxAge: maxAgeInSeconds,
			});
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
	);

export const generatePasskeyAuthenticationOptions = (
	opts: RequiredPassKeyOptions,
	{
		maxAgeInSeconds,
		expirationTime,
	}: { maxAgeInSeconds: number; expirationTime: Date },
) =>
	createAuthEndpoint(
		"/passkey/generate-authenticate-options",
		{
			method: "GET",
			metadata: {
				openapi: {
					operationId: "passkeyGenerateAuthenticateOptions",
					description: "Generate authentication options for a passkey",
					responses: {
						200: {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											challenge: {
												type: "string",
											},
											rp: {
												type: "object",
												properties: {
													name: {
														type: "string",
													},
													id: {
														type: "string",
													},
												},
											},
											user: {
												type: "object",
												properties: {
													id: {
														type: "string",
													},
													name: {
														type: "string",
													},
													displayName: {
														type: "string",
													},
												},
											},
											timeout: {
												type: "number",
											},
											allowCredentials: {
												type: "array",
												items: {
													type: "object",
													properties: {
														id: {
															type: "string",
														},
														type: {
															type: "string",
														},
														transports: {
															type: "array",
															items: {
																type: "string",
															},
														},
													},
												},
											},
											userVerification: {
												type: "string",
											},
											authenticatorSelection: {
												type: "object",
												properties: {
													authenticatorAttachment: {
														type: "string",
													},
													requireResidentKey: {
														type: "boolean",
													},
													userVerification: {
														type: "string",
													},
												},
											},
											extensions: {
												type: "object",
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
				rpID: getRpID(opts, ctx.context.options.baseURL),
				userVerification: "preferred",
				...(userPasskeys.length
					? {
							allowCredentials: userPasskeys.map((passkey) => ({
								id: passkey.credentialID,
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
			const id = generateId(32);
			const webAuthnCookie = ctx.context.createAuthCookie(
				opts.advanced.webAuthnChallengeCookie,
			);
			await ctx.setSignedCookie(webAuthnCookie.name, id, ctx.context.secret, {
				...webAuthnCookie.attributes,
				maxAge: maxAgeInSeconds,
			});
			await ctx.context.internalAdapter.createVerificationValue({
				identifier: id,
				value: JSON.stringify(data),
				expiresAt: expirationTime,
			});
			return ctx.json(options, {
				status: 200,
			});
		},
	);

const verifyPasskeyRegistrationBodySchema = z.object({
	response: z.any(),
	name: z
		.string()
		.meta({
			description: "Name of the passkey",
		})
		.optional(),
});

export const verifyPasskeyRegistration = (options: RequiredPassKeyOptions) =>
	createAuthEndpoint(
		"/passkey/verify-registration",
		{
			method: "POST",
			body: verifyPasskeyRegistrationBodySchema,
			use: [freshSessionMiddleware],
			metadata: {
				openapi: {
					operationId: "passkeyVerifyRegistration",
					description: "Verify registration of a new passkey",
					responses: {
						200: {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/Passkey",
									},
								},
							},
						},
						400: {
							description: "Bad request",
						},
					},
				},
			},
		},
		async (ctx) => {
			const origin = options?.origin || ctx.headers?.get("origin") || "";
			if (!origin) {
				return ctx.json(null, {
					status: 400,
				});
			}
			const resp = ctx.body.response;
			const webAuthnCookie = ctx.context.createAuthCookie(
				options.advanced.webAuthnChallengeCookie,
			);
			const challengeId = await ctx.getSignedCookie(
				webAuthnCookie.name,
				ctx.context.secret,
			);
			if (!challengeId) {
				throw new APIError("BAD_REQUEST", {
					message: PASSKEY_ERROR_CODES.CHALLENGE_NOT_FOUND,
				});
			}

			const data =
				await ctx.context.internalAdapter.findVerificationValue(challengeId);
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
					message:
						PASSKEY_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY,
				});
			}

			try {
				const verification = await verifyRegistrationResponse({
					response: resp,
					expectedChallenge,
					expectedOrigin: origin,
					expectedRPID: getRpID(options, ctx.context.options.baseURL),
					requireUserVerification: false,
				});
				const { verified, registrationInfo } = verification;
				if (!verified || !registrationInfo) {
					return ctx.json(null, {
						status: 400,
					});
				}
				const {
					aaguid,
					// credentialID,
					// credentialPublicKey,
					// counter,
					credentialDeviceType,
					credentialBackedUp,
					credential,
					credentialType,
				} = registrationInfo;
				const pubKey = base64.encode(credential.publicKey);
				const newPasskey: Omit<Passkey, "id"> = {
					name: ctx.body.name,
					userId: userData.id,
					credentialID: credential.id,
					publicKey: pubKey,
					counter: credential.counter,
					deviceType: credentialDeviceType,
					transports: resp.response.transports.join(","),
					backedUp: credentialBackedUp,
					createdAt: new Date(),
					aaguid: aaguid,
				};
				const newPasskeyRes = await ctx.context.adapter.create<
					Omit<Passkey, "id">,
					Passkey
				>({
					model: "passkey",
					data: newPasskey,
				});
				return ctx.json(newPasskeyRes, {
					status: 200,
				});
			} catch (e) {
				console.log(e);
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: PASSKEY_ERROR_CODES.FAILED_TO_VERIFY_REGISTRATION,
				});
			}
		},
	);

const verifyPasskeyAuthenticationBodySchema = z.object({
	response: z.record(z.any(), z.any()),
});

export const verifyPasskeyAuthentication = (options: RequiredPassKeyOptions) =>
	createAuthEndpoint(
		"/passkey/verify-authentication",
		{
			method: "POST",
			body: verifyPasskeyAuthenticationBodySchema,
			metadata: {
				openapi: {
					operationId: "passkeyVerifyAuthentication",
					description: "Verify authentication of a passkey",
					responses: {
						200: {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											session: {
												$ref: "#/components/schemas/Session",
											},
											user: {
												$ref: "#/components/schemas/User",
											},
										},
									},
								},
							},
						},
					},
				},
				$Infer: {
					body: {} as {
						response: AuthenticationResponseJSON;
					},
				},
			},
		},
		async (ctx) => {
			const origin = options?.origin || ctx.headers?.get("origin") || "";
			if (!origin) {
				throw new APIError("BAD_REQUEST", {
					message: "origin missing",
				});
			}
			const resp = ctx.body.response;
			const webAuthnCookie = ctx.context.createAuthCookie(
				options.advanced.webAuthnChallengeCookie,
			);
			const challengeId = await ctx.getSignedCookie(
				webAuthnCookie.name,
				ctx.context.secret,
			);
			if (!challengeId) {
				throw new APIError("BAD_REQUEST", {
					message: PASSKEY_ERROR_CODES.CHALLENGE_NOT_FOUND,
				});
			}

			const data =
				await ctx.context.internalAdapter.findVerificationValue(challengeId);
			if (!data) {
				throw new APIError("BAD_REQUEST", {
					message: PASSKEY_ERROR_CODES.CHALLENGE_NOT_FOUND,
				});
			}
			const { expectedChallenge } = JSON.parse(
				data.value,
			) as WebAuthnChallengeValue;
			const passkey = await ctx.context.adapter.findOne<Passkey>({
				model: "passkey",
				where: [
					{
						field: "credentialID",
						value: resp.id,
					},
				],
			});
			if (!passkey) {
				throw new APIError("UNAUTHORIZED", {
					message: PASSKEY_ERROR_CODES.PASSKEY_NOT_FOUND,
				});
			}
			try {
				const verification = await verifyAuthenticationResponse({
					response: resp as AuthenticationResponseJSON,
					expectedChallenge,
					expectedOrigin: origin,
					expectedRPID: getRpID(options, ctx.context.options.baseURL),
					credential: {
						id: passkey.credentialID,
						publicKey: base64.decode(passkey.publicKey),
						counter: passkey.counter,
						transports: passkey.transports?.split(
							",",
						) as AuthenticatorTransportFuture[],
					},
					requireUserVerification: false,
				});
				const { verified } = verification;
				if (!verified)
					throw new APIError("UNAUTHORIZED", {
						message: PASSKEY_ERROR_CODES.AUTHENTICATION_FAILED,
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
				);
				if (!s) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message: PASSKEY_ERROR_CODES.UNABLE_TO_CREATE_SESSION,
					});
				}
				const user = await ctx.context.internalAdapter.findUserById(
					passkey.userId,
				);
				if (!user) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message: "User not found",
					});
				}
				await setSessionCookie(ctx, {
					session: s,
					user,
				});
				return ctx.json(
					{
						session: s,
					},
					{
						status: 200,
					},
				);
			} catch (e) {
				ctx.context.logger.error("Failed to verify authentication", e);
				throw new APIError("BAD_REQUEST", {
					message: PASSKEY_ERROR_CODES.AUTHENTICATION_FAILED,
				});
			}
		},
	);

/**
 * ### Endpoint
 *
 * GET `/passkey/list-user-passkeys`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.listPasskeys`
 *
 * **client:**
 * `authClient.passkey.listUserPasskeys`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/passkey#api-method-passkey-list-user-passkeys)
 */
export const listPasskeys = createAuthEndpoint(
	"/passkey/list-user-passkeys",
	{
		method: "GET",
		use: [sessionMiddleware],
		metadata: {
			openapi: {
				description: "List all passkeys for the authenticated user",
				responses: {
					"200": {
						description: "Passkeys retrieved successfully",
						content: {
							"application/json": {
								schema: {
									type: "array",
									items: {
										$ref: "#/components/schemas/Passkey",
										required: [
											"id",
											"userId",
											"publicKey",
											"createdAt",
											"updatedAt",
										],
									},
									description:
										"Array of passkey objects associated with the user",
								},
							},
						},
					},
				},
			},
		},
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
);

const deletePasskeyBodySchema = z.object({
	id: z.string().meta({
		description: 'The ID of the passkey to delete. Eg: "some-passkey-id"',
	}),
});

/**
 * ### Endpoint
 *
 * POST `/passkey/delete-passkey`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.deletePasskey`
 *
 * **client:**
 * `authClient.passkey.deletePasskey`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/passkey#api-method-passkey-delete-passkey)
 */
export const deletePasskey = createAuthEndpoint(
	"/passkey/delete-passkey",
	{
		method: "POST",
		body: deletePasskeyBodySchema,
		use: [sessionMiddleware],
		metadata: {
			openapi: {
				description: "Delete a specific passkey",
				responses: {
					"200": {
						description: "Passkey deleted successfully",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										status: {
											type: "boolean",
											description:
												"Indicates whether the deletion was successful",
										},
									},
									required: ["status"],
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const passkey = await ctx.context.adapter.findOne<Passkey>({
			model: "passkey",
			where: [
				{
					field: "id",
					value: ctx.body.id,
				},
			],
		});
		if (!passkey) {
			throw new APIError("NOT_FOUND", {
				message: PASSKEY_ERROR_CODES.PASSKEY_NOT_FOUND,
			});
		}
		if (passkey.userId !== ctx.context.session.user.id) {
			throw new APIError("UNAUTHORIZED");
		}
		await ctx.context.adapter.delete({
			model: "passkey",
			where: [{ field: "id", value: passkey.id }],
		});
		return ctx.json({
			status: true,
		});
	},
);

const updatePassKeyBodySchema = z.object({
	id: z.string().meta({
		description: `The ID of the passkey which will be updated. Eg: \"passkey-id\"`,
	}),
	name: z.string().meta({
		description: `The new name which the passkey will be updated to. Eg: \"my-new-passkey-name\"`,
	}),
});

/**
 * ### Endpoint
 *
 * POST `/passkey/update-passkey`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.updatePasskey`
 *
 * **client:**
 * `authClient.passkey.updatePasskey`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/passkey#api-method-passkey-update-passkey)
 */
export const updatePasskey = createAuthEndpoint(
	"/passkey/update-passkey",
	{
		method: "POST",
		body: updatePassKeyBodySchema,
		use: [sessionMiddleware],
		metadata: {
			openapi: {
				description: "Update a specific passkey's name",
				responses: {
					"200": {
						description: "Passkey updated successfully",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										passkey: {
											$ref: "#/components/schemas/Passkey",
										},
									},
									required: ["passkey"],
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const passkey = await ctx.context.adapter.findOne<Passkey>({
			model: "passkey",
			where: [
				{
					field: "id",
					value: ctx.body.id,
				},
			],
		});

		if (!passkey) {
			throw new APIError("NOT_FOUND", {
				message: PASSKEY_ERROR_CODES.PASSKEY_NOT_FOUND,
			});
		}

		if (passkey.userId !== ctx.context.session.user.id) {
			throw new APIError("UNAUTHORIZED", {
				message:
					PASSKEY_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY,
			});
		}

		const updatedPasskey = await ctx.context.adapter.update<Passkey>({
			model: "passkey",
			where: [
				{
					field: "id",
					value: ctx.body.id,
				},
			],
			update: {
				name: ctx.body.name,
			},
		});

		if (!updatedPasskey) {
			throw new APIError("INTERNAL_SERVER_ERROR", {
				message: PASSKEY_ERROR_CODES.FAILED_TO_UPDATE_PASSKEY,
			});
		}
		return ctx.json(
			{
				passkey: updatedPasskey,
			},
			{
				status: 200,
			},
		);
	},
);
