/**
 * Lightweight auth API client for the UI pages.
 * Provides a similar API surface to the Better Auth client but uses plain fetch.
 */

import { getConfig } from "@/config";

interface ApiResponse<T> {
	data: T | null;
	error: { message: string; status?: number } | null;
}

async function request<T>(
	path: string,
	options: RequestInit = {},
): Promise<ApiResponse<T>> {
	const config = getConfig();
	const url = `${config.apiBaseUrl}${path}`;

	try {
		const res = await fetch(url, {
			...options,
			headers: {
				"Content-Type": "application/json",
				...options.headers,
			},
			credentials: "include",
		});

		const data = await res.json().catch(() => null);

		if (!res.ok) {
			return {
				data: null,
				error: {
					message: data?.message || data?.error || "Request failed",
					status: res.status,
				},
			};
		}

		return { data, error: null };
	} catch (err) {
		return {
			data: null,
			error: {
				message: err instanceof Error ? err.message : "Network error",
			},
		};
	}
}

export const authClient = {
	signIn: {
		email: (body: { email: string; password: string; rememberMe?: boolean }) =>
			request<{ user: any; session: any }>("/sign-in/email", {
				method: "POST",
				body: JSON.stringify(body),
			}),
		social: (body: { provider: string; callbackURL?: string }) => {
			const config = getConfig();
			const params = new URLSearchParams({
				provider: body.provider,
				...(body.callbackURL && { callbackURL: body.callbackURL }),
			});
			window.location.href = `${config.apiBaseUrl}/sign-in/social?${params}`;
		},
	},

	signUp: {
		email: (body: { email: string; password: string; name: string }) =>
			request<{ user: any; session: any }>("/sign-up/email", {
				method: "POST",
				body: JSON.stringify(body),
			}),
	},

	signOut: () =>
		request<{ success: boolean }>("/sign-out", {
			method: "POST",
		}),

	getSession: () =>
		request<{ user: any; session: any }>("/get-session", {
			method: "GET",
		}),

	forgetPassword: (body: { email: string; redirectTo?: string }) =>
		request<{ success: boolean }>("/forget-password", {
			method: "POST",
			body: JSON.stringify(body),
		}),

	resetPassword: (body: { token: string; newPassword: string }) =>
		request<{ success: boolean }>("/reset-password", {
			method: "POST",
			body: JSON.stringify(body),
		}),

	verifyEmail: (body: { token: string }) =>
		request<{ user: any }>("/verify-email", {
			method: "POST",
			body: JSON.stringify(body),
		}),

	sendVerificationEmail: (body: { email: string }) =>
		request<{ success: boolean }>("/send-verification-email", {
			method: "POST",
			body: JSON.stringify(body),
		}),

	updateUser: (body: { name?: string; image?: string }) =>
		request<{ user: any }>("/update-user", {
			method: "POST",
			body: JSON.stringify(body),
		}),

	changePassword: (body: { currentPassword: string; newPassword: string }) =>
		request<{ success: boolean }>("/change-password", {
			method: "POST",
			body: JSON.stringify(body),
		}),

	passkey: {
		authenticate: () =>
			request<{ user: any; session: any }>("/passkey/authenticate", {
				method: "POST",
			}),
		register: () =>
			request<{ success: boolean }>("/passkey/register", {
				method: "POST",
			}),
		addPasskey: () =>
			request<{ success: boolean }>("/passkey/add-passkey", {
				method: "POST",
			}),
	},
};

export type AuthClient = typeof authClient;
