/**
 * SMS sending module for @better-auth/dash
 *
 * This module provides SMS sending functionality for OTP verification codes
 * with template support similar to emails.
 */

import { logger } from "better-auth";
import { DASH_API_URL } from "./constants";

/**
 * SMS template definitions with their required variables
 */
export const SMS_TEMPLATES = {
	"phone-verification": {
		variables: {} as {
			code: string;
			appName?: string;
			expirationMinutes?: string;
		},
	},
	"two-factor": {
		variables: {} as {
			code: string;
			appName?: string;
			expirationMinutes?: string;
		},
	},
	"sign-in-otp": {
		variables: {} as {
			code: string;
			appName?: string;
			expirationMinutes?: string;
		},
	},
} as const;

export type SMSTemplateId = keyof typeof SMS_TEMPLATES;
export type SMSTemplateVariables<T extends SMSTemplateId> =
	(typeof SMS_TEMPLATES)[T]["variables"];

export interface SendSMSResult {
	success: boolean;
	messageId?: string;
	error?: string;
}

export interface SMSConfig {
	apiKey?: string;
	apiUrl?: string;
}

/**
 * Options for sending SMS
 */
export interface SendSMSOptions {
	/**
	 * Phone number to send to (E.164 format, e.g., +1234567890)
	 */
	to: string;
	/**
	 * The OTP code to send
	 */
	code: string;
	/**
	 * The SMS template to use (optional - defaults to generic verification message)
	 */
	template?: SMSTemplateId;
}

/**
 * Create an SMS sender instance
 */
export function createSMSSender(config?: SMSConfig) {
	const baseUrl =
		config?.apiUrl || process.env.BETTER_AUTH_API_URL || DASH_API_URL;
	const apiUrl = baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
	const apiKey = config?.apiKey || process.env.BETTER_AUTH_API_KEY || "";

	if (!apiKey) {
		logger.warn(
			"[Dash] No API key provided for SMS sending. " +
				"Set BETTER_AUTH_API_KEY environment variable or pass apiKey in config.",
		);
	}

	/**
	 * Send an SMS with OTP code
	 */
	async function send(options: SendSMSOptions): Promise<SendSMSResult> {
		if (!apiKey) {
			return {
				success: false,
				error: "API key not configured",
			};
		}

		try {
			const response = await fetch(`${apiUrl}/v1/sms/send`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					to: options.to,
					code: options.code,
					template: options.template,
				}),
			});

			if (!response.ok) {
				const error = await response
					.json()
					.catch(() => ({ message: "Unknown error" }));
				return {
					success: false,
					error: error.message || `HTTP ${response.status}`,
				};
			}

			const result = await response.json();
			return {
				success: true,
				messageId: result.messageId,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to send SMS",
			};
		}
	}

	return {
		send,
	};
}

/**
 * Send an SMS with OTP code via Better Auth Infra.
 *
 * @example
 * ```ts
 * import { sendSMS } from "@better-auth/dash";
 *
 * // For phone verification
 * await sendSMS({
 *   to: "+1234567890",
 *   code: "123456",
 *   template: "phone-verification",
 * });
 *
 * // For two-factor authentication
 * await sendSMS({
 *   to: "+1234567890",
 *   code: "123456",
 *   template: "two-factor",
 * });
 *
 * // Default (no template specified - uses generic message)
 * await sendSMS({
 *   to: "+1234567890",
 *   code: "123456",
 * });
 * ```
 */
export async function sendSMS(
	options: SendSMSOptions,
	config?: SMSConfig,
): Promise<SendSMSResult> {
	const sender = createSMSSender(config);
	return sender.send(options);
}
