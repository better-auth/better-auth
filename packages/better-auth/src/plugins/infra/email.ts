/**
 * Email sending module for @better-auth/dash
 *
 * This module provides email sending functionality that integrates with
 * Better Auth Infra's template system.
 */

import { logger } from "better-auth";
import { DASH_API_URL } from "./constants";

/**
 * Email template definitions with their required variables
 */
export const EMAIL_TEMPLATES = {
	"verify-email": {
		variables: {} as {
			verificationCode?: string;
			verificationUrl: string;
			userEmail: string;
			userName?: string;
			appName?: string;
			expirationMinutes?: string;
		},
	},
	"reset-password": {
		variables: {} as {
			resetLink: string;
			userEmail: string;
			userName?: string;
			appName?: string;
			expirationMinutes?: string;
		},
	},
	"change-email": {
		variables: {} as {
			confirmationLink: string;
			newEmail: string;
			currentEmail: string;
			userName?: string;
			appName?: string;
			expirationMinutes?: string;
		},
	},
	"sign-in-otp": {
		variables: {} as {
			otpCode: string;
			userEmail: string;
			appName?: string;
			expirationMinutes?: string;
		},
	},
	"verify-email-otp": {
		variables: {} as {
			otpCode: string;
			userEmail: string;
			appName?: string;
			expirationMinutes?: string;
		},
	},
	"reset-password-otp": {
		variables: {} as {
			otpCode: string;
			userEmail: string;
			appName?: string;
			expirationMinutes?: string;
		},
	},
	"magic-link": {
		variables: {} as {
			magicLink: string;
			userEmail: string;
			appName?: string;
			expirationMinutes?: string;
		},
	},
	"two-factor": {
		variables: {} as {
			otpCode: string;
			userEmail: string;
			userName?: string;
			appName?: string;
			expirationMinutes?: string;
		},
	},
	invitation: {
		variables: {} as {
			inviteLink: string;
			inviterName: string;
			inviterEmail: string;
			organizationName: string;
			role: string;
			appName?: string;
			expirationDays?: string;
		},
	},
	"application-invite": {
		variables: {} as {
			inviteLink: string;
			inviterName: string;
			inviterEmail: string;
			inviteeEmail: string;
			appName?: string;
			expirationDays?: string;
		},
	},
	"delete-account": {
		variables: {} as {
			deletionLink: string;
			userEmail: string;
			userName?: string;
			appName?: string;
			expirationMinutes?: string;
		},
	},
	"stale-account-user": {
		variables: {} as {
			userEmail: string;
			userName?: string;
			appName?: string;
			daysSinceLastActive: string;
			loginTime: string;
			loginLocation?: string;
			loginDevice?: string;
			loginIp?: string;
		},
	},
	"stale-account-admin": {
		variables: {} as {
			userEmail: string;
			userName?: string;
			userId: string;
			appName?: string;
			daysSinceLastActive: string;
			loginTime: string;
			loginLocation?: string;
			loginDevice?: string;
			loginIp?: string;
			adminEmail: string;
		},
	},
} as const;

export type EmailTemplateId = keyof typeof EMAIL_TEMPLATES;

export type EmailTemplateVariables<T extends EmailTemplateId> =
	(typeof EMAIL_TEMPLATES)[T]["variables"];

export interface SendEmailResult {
	success: boolean;
	messageId?: string;
	error?: string;
}

export interface EmailConfig {
	apiKey?: string;
	apiUrl?: string;
}

/**
 * Type-safe send email options
 */
export type SendEmailOptions<T extends EmailTemplateId = EmailTemplateId> = {
	/**
	 * The template ID to use
	 */
	template: T;
	/**
	 * Email recipient
	 */
	to: string;
	/**
	 * Template variables (type-safe based on template)
	 */
	variables: EmailTemplateVariables<T>;
	/**
	 * Optional subject override (uses template default if not provided)
	 */
	subject?: string;
};

/**
 * Create an email sender instance
 */
export function createEmailSender(config?: EmailConfig) {
	// Ensure /api prefix is included
	const baseUrl =
		config?.apiUrl || process.env.BETTER_AUTH_API_URL || DASH_API_URL;
	const apiUrl = baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
	const apiKey = config?.apiKey || process.env.BETTER_AUTH_API_KEY || "";

	if (!apiKey) {
		logger.warn(
			"[Dash] No API key provided for email sending. " +
				"Set BETTER_AUTH_API_KEY environment variable or pass apiKey in config.",
		);
	}

	/**
	 * Send an email using a template from Better Auth Infra
	 */
	async function send<T extends EmailTemplateId>(
		options: SendEmailOptions<T>,
	): Promise<SendEmailResult> {
		if (!apiKey) {
			return {
				success: false,
				error: "API key not configured",
			};
		}

		try {
			const response = await fetch(`${apiUrl}/v1/email/send`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					template: options.template,
					to: options.to,
					variables: options.variables || {},
					subject: options.subject,
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
				error: error instanceof Error ? error.message : "Failed to send email",
			};
		}
	}

	/**
	 * Get available email templates
	 */
	async function getTemplates(): Promise<
		{ id: string; name: string; description?: string }[]
	> {
		if (!apiKey) {
			return [];
		}

		try {
			const response = await fetch(`${apiUrl}/v1/email/templates`, {
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
			});

			if (!response.ok) {
				return [];
			}

			return response.json();
		} catch {
			return [];
		}
	}

	return {
		send,
		getTemplates,
	};
}

/**
 * Send an email using the Better Auth dashboard's email templates.
 *
 * @example
 * ```ts
 * import { sendEmail } from "@better-auth/dash";
 *
 * // Type-safe - variables are inferred from template
 * await sendEmail({
 *   template: "reset-password",
 *   to: "user@example.com",
 *   variables: {
 *     resetLink: "https://...",
 *     userEmail: "user@example.com",
 *   },
 * });
 * ```
 */
export async function sendEmail<T extends EmailTemplateId>(
	options: SendEmailOptions<T>,
	config?: EmailConfig,
): Promise<SendEmailResult> {
	const sender = createEmailSender(config);
	return sender.send(options);
}
