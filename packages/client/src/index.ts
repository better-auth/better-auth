import {
	type BetterFetch,
	type BetterFetchOption,
	createFetch,
} from "@better-fetch/fetch";
import { useEffect } from "react";
import type { ZodObject, ZodSchema } from "zod";
import type { z } from "zod";
import type { BetterAuth } from "better-auth";
import type {
	InferProviderKeys,
	InferProviderSignin,
	InferRegister,
	InferSession,
} from "better-auth/actions";
import type { User } from "better-auth/adapters";
import type { BetterAuthOptions } from "better-auth";
import type {
	Providers,
	CustomProvider,
	Provider,
} from "better-auth/providers";
import type { SessionResponse } from "better-auth/routes/session";
import type { UnionToIntersection } from "@better-auth/shared";
import { ClientError } from "./errors";
import { useStore } from "./store";

export interface ClientPlugin<T extends string = string> {
	id: T;
	name: string;
	getActions: <T>($fetch: BetterFetch) => {
		[key in string]: (...args: any[]) => Promise<any> | any;
	};
}

interface AuthClientOptions {
	/**
	 * The base URL for the better auth server. Make sure to include the path.
	 * Recommended to use environment variables.
	 * @example
	 * ```ts
	 * const client = getAuthClient({
	 * 	baseURL: `${process.env.API_URL}/api/auth` || "http://localhost:3000/api/auth",
	 * });
	 * ```
	 */
	baseURL: string;
	betterFetchOptions?: BetterFetchOption;
	plugins?: ClientPlugin[];
}

function formatCbURL(callbackURL?: string) {
	if (!callbackURL) {
		return window.location.href;
	}
	return callbackURL.startsWith("http")
		? callbackURL
		: `${window.location.origin}${
				callbackURL.startsWith("/") ? "" : "/"
			}${callbackURL}`;
}

/**
 * Better Auth fetch client.
 */
const getAuthClient = <
	B extends BetterAuthOptions,
	O extends AuthClientOptions,
>(
	options: O,
) => {
	const useAuthStore = useStore;
	if (!options.baseURL || !options.baseURL.startsWith("http")) {
		throw new ClientError(
			"Base URL is required. Make sure to include the whole base path and protocol.",
		);
	}

	const $fetch = createFetch({
		...options.betterFetchOptions,
		baseURL: options.baseURL,
	});
	async function getCSRFToken() {
		return await $fetch<{ csrfToken: string }>("/csrf");
	}

	/**
	 * Signin with a provider.
	 *
	 * If the user doesn't exist this will throw an error. If
	 * you want to create a new user if the user doesn't
	 * exist use `signInOrSignUp` instead.
	 */
	async function signIn<
		T extends InferProviderSignin<B["providers"]>,
		K extends keyof T,
	>(
		input: T[K] extends { input: infer Z }
			? Z extends ZodObject<any>
				? {
						provider: K;
						data: z.infer<Z>;
					}
				: {
						provider: K;
						data: T[K];
						/**
						 * The callback url after a successful
						 * signin
						 */
						callbackURL?: string;
						/**
						 * Skip the redirect. By default, it will redirect
						 * to the provider's authorization URL.
						 */
						skipRedirect?: boolean;
					}
			: {
					/**
					 * Provider to user
					 */
					provider: K;
					/**
					 * The callback url after a successful
					 * signin
					 */
					callbackURL?: string;
					/**
					 * Skip the redirect. By default, it will redirect
					 * to the provider's authorization URL.
					 */
					skipRedirect?: boolean;
				},
	) {
		const { data: csrfToken, error: csrfError } = await getCSRFToken();
		if (csrfError) {
			throw new ClientError(
				"Failed to get CSRF token. Make sure the server is running. And the baseURL is correct.",
				csrfError.message,
			);
		}

		const { data, error } = await $fetch<
			| { redirect: true; url: string }
			| { redirect: false; sessionToken: string; user: User }
		>("/signin", {
			body: {
				...input,
				csrfToken: csrfToken.csrfToken,
				currentURL: window.location.href,
				callbackURL: formatCbURL(input?.callbackURL),
			},
		});
		if (error) {
			return {
				data: null,
				error,
			};
		}
		if (data?.redirect) {
			if (!input?.skipRedirect) {
				window.location.href = data.url;
				return {
					data,
					error: null,
				};
			}
			return {
				data,
				error: null,
			};
		}
		return {
			data: data,
			error: null,
		};
	}

	/**
	 * Sign in or sign up with a provider. If the user
	 * doesn't exist it will create a new user. If the user
	 * exists it will sign in the user.
	 */
	async function signInOrSignUp<
		T extends InferProviderSignin<B["providers"]>,
		K extends keyof T,
	>(
		input: (T[K] extends { input: infer Z }
			? Z extends ZodSchema
				? {
						provider: K;
						signIn: z.infer<Z>;
					}
				: never
			: {
					/**
					 * Provider to user
					 */
					provider: K;
					/**
					 * The callback url after a successful
					 * signin
					 */
					callbackURL?: string;
					/**
					 * Skip the redirect. By default, it will redirect
					 * to the provider's authorization URL.
					 */
					skipRedirect?: boolean;
				}) &
			(B["user"] extends { fields: any }
				? {
						/**
						 * Data to create new user, if
						 * the user doesn't exist.
						 */
						data: InferRegister<
							B,
							Providers[K extends keyof Providers ? K : never]
						>;
					}
				: {}),
	) {
		const { data: csrfToken, error: csrfError } = await getCSRFToken();
		if (csrfError) {
			throw new ClientError(
				"Failed to get CSRF token. Make sure the server is running. And the baseURL is correct.",
				csrfError.message,
			);
		}

		const { data, error } = await $fetch<
			| { redirect: true; url: string }
			| { redirect: false; sessionToken: string; user: User }
		>("/signin", {
			body: {
				...input,
				csrfToken: csrfToken.csrfToken,
				currentURL: window.location.href,
				callbackURL: formatCbURL(input?.callbackURL),
			},
		});
		if (error) {
			return {
				data: null,
				error,
			};
		}
		if (data?.redirect) {
			if (!input?.skipRedirect) {
				window.location.href = data.url;
				return {
					data: null,
					error: null,
				};
			}
			return {
				data,
				error: null,
			};
		}
		return {
			data: data,
			error: null,
		};
	}

	async function signUp<P extends InferProviderKeys<B["providers"]>>(
		input: Providers[P] extends CustomProvider
			? {
					provider: P;
					data: InferRegister<B, Providers[P]>;
					/**
					 * Automatically create a session after
					 * signing up.
					 *
					 * @default false
					 */
					autoCreateSession?: boolean;
					/**
					 * The callback url after a successful
					 * signing up.
					 */
					callbackURL?: string;
				}
			: B["user"] extends {
						fields: any;
					}
				? {
						provider: P;
						data: Omit<
							InferRegister<
								B,
								Providers[P] extends Provider ? Providers[P] : never
							>,
							"id"
						>;
						/**
						 * Automatically create a session after
						 * signing up.
						 *
						 * @default false
						 */
						autoCreateSession?: boolean;
						/**
						 * The callback url after a successful
						 * signing up.
						 */
						callbackURL?: string;
					}
				: {
						provider: P;
						data?: Omit<
							InferRegister<
								B,
								Providers[P] extends Provider ? Providers[P] : never
							>,
							"id"
						>;
						/**
						 * Automatically create a session after
						 * signing up.
						 *
						 * @default true
						 */
						autoCreateSession?: boolean;
						/**
						 * The callback url after a successful
						 * signing up.
						 */
						callbackURL?: string;
					},
	) {
		const { data: csrfToken, error: csrfError } = await getCSRFToken();
		if (csrfError) {
			throw new ClientError(
				"Failed to get CSRF token. Make sure the server is running. And the baseURL is correct.",
				csrfError.message,
			);
		}

		const { data, error } = await $fetch<
			| { redirect: true; url: string }
			| { redirect: false; sessionToken: string; user: User }
		>("/signup", {
			body: {
				...input,
				csrfToken: csrfToken.csrfToken,
				currentURL: window.location.href,
				callbackURL: formatCbURL(input?.callbackURL),
				autoCreateSession:
					input.autoCreateSession !== undefined
						? input.autoCreateSession
						: true,
			},
		});
		if (error) {
			return {
				data: null,
				error,
			};
		}
		if (data?.redirect) {
			window.location.href = data.url;
			return {
				data: null,
				error: null,
			};
		}
		return {
			data: data,
			error: null,
		};
	}

	/**
	 * Signout
	 */
	const signOut = async (input?: {
		callbackURL?: string;
	}) => {
		const { data: csrfToken } = await getCSRFToken();
		const { data, error } = await $fetch<{
			url: string;
			redirect: boolean;
		}>("/signout", {
			body: {
				csrfToken: csrfToken?.csrfToken,
			},
		});
		if (error) {
			return {
				data: null,
				error,
			};
		}
		useAuthStore.getState().setSession(null);
		if (input?.callbackURL) {
			window.location.href = input?.callbackURL;
			return {
				data: null,
				error: null,
			};
		}
		return {
			data,
			error: null,
		};
	};

	/**
	 * Get the current session.
	 */
	const getSession = async () => {
		const { data: csrfToken } = await getCSRFToken();
		const { data, error } = await $fetch<SessionResponse>("/session", {
			method: "POST",
			body: {
				csrfToken: csrfToken?.csrfToken,
			},
		});
		if (error) {
			return null;
		}
		useAuthStore.getState().setSession(data);
		return useAuthStore.getState().session as InferSession<B> | null;
	};

	const react = {
		/**
		 * Only use in a react component.
		 */
		useSession: () => {
			const session = useAuthStore((selector) => selector.session);
			const setSession = useAuthStore((selector) => selector.setSession);

			useEffect(() => {
				(async () => {
					const data = await getSession();
					setSession(data);
				})();
			}, [setSession]);
			return session as InferSession<B> | null;
		},
	};
	type Actions = O["plugins"] extends ClientPlugin[]
		? UnionToIntersection<ReturnType<O["plugins"][number]["getActions"]>>
		: {};
	const baseClient = {
		signIn,
		signInOrSignUp,
		signUp,
		signOut,
		getSession,
	};
	const pluginActions = options.plugins?.reduce((acc, plugin) => {
		return {
			// biome-ignore lint/performance/noAccumulatingSpread: <explanation>
			...acc,
			...plugin.getActions($fetch),
		};
	}, {}) as Actions extends {} ? Actions : never;
	return {
		...baseClient,
		...react,
		...pluginActions,
		$invoke: $fetch,
	};
};

export type BetterAuthClient = ReturnType<typeof getAuthClient>;

export function createAuthClient<B extends BetterAuth>() {
	return <O extends AuthClientOptions>(options: O) => {
		return getAuthClient<B["options"], O>(options);
	};
}

export type Session<T> = T extends {
	getSession: () => infer R;
}
	? Awaited<R>
	: never;
