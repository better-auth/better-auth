import { declareEndpoint } from "../../better-call/shared";
import * as z from "zod";

// Main two-factor endpoints
export const enableTwoFactorDef = declareEndpoint("/two-factor/enable", {
	method: "POST",
	body: z.object({
		password: z.string().meta({
			description: "User password",
		}),
		issuer: z
			.string()
			.meta({
				description: "Custom issuer for the TOTP URI",
			})
			.optional(),
	}),
	metadata: {
		openapi: {
			summary: "Enable two factor authentication",
			description:
				"Use this endpoint to enable two factor authentication. This will generate a TOTP URI and backup codes. Once the user verifies the TOTP URI, the two factor authentication will be enabled.",
			responses: {
				200: {
					description: "Successful response",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									totpURI: {
										type: "string",
										description: "TOTP URI",
									},
									backupCodes: {
										type: "array",
										items: {
											type: "string",
										},
										description: "Backup codes",
									},
								},
							},
						},
					},
				},
			},
		},
	},
});

export const disableTwoFactorDef = declareEndpoint("/two-factor/disable", {
	method: "POST",
	body: z.object({
		password: z.string().meta({
			description: "User password",
		}),
	}),
	metadata: {
		openapi: {
			summary: "Disable two factor authentication",
			description: "Use this endpoint to disable two factor authentication.",
			responses: {
				200: {
					description: "Successful response",
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
});

// TOTP endpoints
export const generateTOTPDef = declareEndpoint("/totp/generate", {
	method: "POST",
	body: z.object({
		secret: z.string().meta({
			description: "The secret to generate the TOTP code",
		}),
	}),
	metadata: {
		openapi: {
			summary: "Generate TOTP code",
			description: "Use this endpoint to generate a TOTP code",
			responses: {
				200: {
					description: "Successful response",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									code: {
										type: "string",
									},
								},
							},
						},
					},
				},
			},
		},
	},
});

export const getTOTPURIDef = declareEndpoint("/totp/get-uri", {
	method: "POST",
	body: z.object({
		secret: z.string().meta({
			description: "The secret to generate the TOTP URI",
		}),
		issuer: z
			.string()
			.meta({
				description: "Custom issuer for the TOTP URI",
			})
			.optional(),
	}),
	metadata: {
		openapi: {
			summary: "Get TOTP URI",
			description: "Use this endpoint to get a TOTP URI",
			responses: {
				200: {
					description: "Successful response",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									uri: {
										type: "string",
									},
								},
							},
						},
					},
				},
			},
		},
	},
});

export const verifyTOTPDef = declareEndpoint("/two-factor/verify-totp", {
	method: "POST",
	body: z.object({
		code: z.string().meta({
			description: "The TOTP code to verify",
		}),
		callbackURL: z
			.string()
			.meta({
				description: "Callback URL after verification",
			})
			.optional(),
	}),
	requireHeaders: true,
	metadata: {
		openapi: {
			summary: "Verify TOTP code",
			description: "Use this endpoint to verify a TOTP code",
			responses: {
				200: {
					description: "Successful response",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									token: {
										type: "string",
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
	},
});

// OTP endpoints
export const send2FaOTPDef = declareEndpoint("/two-factor/send-otp", {
	method: "POST",
	body: z.object({
		email: z.string().meta({
			description: "Email to send OTP to",
		}),
	}),
	metadata: {
		openapi: {
			summary: "Send two factor OTP",
			description: "Use this endpoint to send a two factor OTP",
			responses: {
				200: {
					description: "Successful response",
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
});

export const verifyOTPDef = declareEndpoint("/two-factor/verify-otp", {
	method: "POST",
	body: z.object({
		otp: z.string().meta({
			description: "OTP code to verify",
		}),
		callbackURL: z
			.string()
			.meta({
				description: "Callback URL after verification",
			})
			.optional(),
	}),
	requireHeaders: true,
	metadata: {
		openapi: {
			summary: "Verify OTP code",
			description: "Use this endpoint to verify an OTP code",
			responses: {
				200: {
					description: "Successful response",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									token: {
										type: "string",
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
	},
});

// Backup codes endpoint
export const verifyBackupCodeDef = declareEndpoint(
	"/two-factor/verify-backup-code",
	{
		method: "POST",
		body: z.object({
			code: z.string().meta({
				description: "Backup code to verify",
			}),
		}),
		requireHeaders: true,
		metadata: {
			openapi: {
				summary: "Verify backup code",
				description: "Use this endpoint to verify a backup code",
				responses: {
					200: {
						description: "Successful response",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										token: {
											type: "string",
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
		},
	},
);
