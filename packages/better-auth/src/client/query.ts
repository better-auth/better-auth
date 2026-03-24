import type { ClientFetchOption } from "@better-auth/core";
import type { BetterFetch, BetterFetchError } from "@better-fetch/fetch";
import type { PreinitializedWritableAtom } from "nanostores";
import { atom, onMount } from "nanostores";
import { getStableReference } from "./stable-reference";
import type { SessionQueryParams } from "./types";

// SSR detection
const isServer = () => typeof window === "undefined";

export type AuthQueryState<T> = {
	data: null | T;
	error: null | BetterFetchError;
	isPending: boolean;
	isRefetching: boolean;
	refetch: (
		queryParams?: { query?: SessionQueryParams } | undefined,
	) => Promise<void>;
};

export type AuthQueryAtom<T> = PreinitializedWritableAtom<AuthQueryState<T>>;

export function getStableAuthQueryState<T>(
	current: AuthQueryState<T>,
	next: AuthQueryState<T>,
): AuthQueryState<T> {
	const nextData =
		current.data == null || next.data == null
			? next.data
			: getStableReference(current.data, next.data);
	const nextError = current.error === next.error ? current.error : next.error;

	if (
		current.data === nextData &&
		current.error === nextError &&
		current.isPending === next.isPending &&
		current.isRefetching === next.isRefetching &&
		current.refetch === next.refetch
	) {
		return current;
	}

	return {
		...next,
		data: nextData,
		error: nextError,
	};
}

export const useAuthQuery = <T>(
	initializedAtom:
		| PreinitializedWritableAtom<any>
		| PreinitializedWritableAtom<any>[],
	path: string,
	$fetch: BetterFetch,
	options?:
		| (
				| ((value: {
						data: null | T;
						error: null | BetterFetchError;
						isPending: boolean;
				  }) => ClientFetchOption)
				| ClientFetchOption
		  )
		| undefined,
) => {
	const value: AuthQueryAtom<T> = atom({
		data: null,
		error: null,
		isPending: true,
		isRefetching: false,
		refetch: (queryParams) => fn(queryParams),
	});

	const fn = async (
		queryParams?: { query?: SessionQueryParams } | undefined,
	) => {
		return new Promise<void>((resolve) => {
			const opts =
				typeof options === "function"
					? options({
							data: value.get().data,
							error: value.get().error,
							isPending: value.get().isPending,
						})
					: options;

			$fetch<T>(path, {
				...opts,
				query: {
					...opts?.query,
					...queryParams?.query,
				},
				async onSuccess(context) {
					const currentValue = value.get();
					const nextValue = getStableAuthQueryState(currentValue, {
						data: context.data,
						error: null,
						isPending: false,
						isRefetching: false,
						refetch: currentValue.refetch,
					});
					if (nextValue !== currentValue) {
						value.set(nextValue);
					}
					await opts?.onSuccess?.(context);
				},
				async onError(context) {
					const currentValue = value.get();
					const { request } = context;
					const retryAttempts =
						typeof request.retry === "number"
							? request.retry
							: request.retry?.attempts;
					const retryAttempt = request.retryAttempt || 0;
					if (retryAttempts && retryAttempt < retryAttempts) return;
					const isUnauthorized = context.error.status === 401;
					const nextValue = getStableAuthQueryState(currentValue, {
						error: context.error,
						data: isUnauthorized
							? null // clear session on HTTP 401
							: currentValue.data, // preserve stale data on other errors
						isPending: false,
						isRefetching: false,
						refetch: currentValue.refetch,
					});
					if (nextValue !== currentValue) {
						value.set(nextValue);
					}
					await opts?.onError?.(context);
				},
				async onRequest(context) {
					const currentValue = value.get();
					const nextValue = getStableAuthQueryState(currentValue, {
						isPending: currentValue.data === null,
						data: currentValue.data,
						error: null,
						isRefetching: true,
						refetch: currentValue.refetch,
					});
					if (nextValue !== currentValue) {
						value.set(nextValue);
					}
					await opts?.onRequest?.(context);
				},
			})
				.catch((error) => {
					const currentValue = value.get();
					const nextValue = getStableAuthQueryState(currentValue, {
						error,
						data: currentValue.data,
						isPending: false,
						isRefetching: false,
						refetch: currentValue.refetch,
					});
					if (nextValue !== currentValue) {
						value.set(nextValue);
					}
				})
				.finally(() => {
					resolve(void 0);
				});
		});
	};
	initializedAtom = Array.isArray(initializedAtom)
		? initializedAtom
		: [initializedAtom];
	let isMounted = false;

	for (const initAtom of initializedAtom) {
		initAtom.subscribe(async () => {
			if (isServer()) {
				// On server, don't trigger fetch
				return;
			}
			if (isMounted) {
				await fn();
			} else {
				onMount(value, () => {
					const timeoutId = setTimeout(async () => {
						if (!isMounted) {
							await fn();
							isMounted = true;
						}
					}, 0);
					return () => {
						value.off();
						initAtom.off();
						clearTimeout(timeoutId);
					};
				});
			}
		});
	}
	return value;
};
