import type { ClientFetchOption } from "@better-auth/core";
import type { BetterFetch, BetterFetchError } from "@better-fetch/fetch";
import type { PreinitializedWritableAtom } from "nanostores";
import { onMount } from "nanostores";
import { isJsonEqual, withEquality } from "./equality";
import { createAuthQueryAtom } from "./query-atom";
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
		fetchOpts?: { cancelInFlight?: boolean } | undefined,
	) => Promise<void>;
};

export type AuthQueryAtom<T> = PreinitializedWritableAtom<AuthQueryState<T>>;

function isAuthQueryStateEqual<T>(
	a: AuthQueryState<T>,
	b: AuthQueryState<T>,
): boolean {
	return (
		isJsonEqual(a.data, b.data) &&
		a.error === b.error &&
		a.isPending === b.isPending &&
		a.isRefetching === b.isRefetching &&
		a.refetch === b.refetch
	);
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
	let activeAbortController: AbortController | undefined;
	let latestRequestId = 0;

	const fn = async (
		queryParams?: { query?: SessionQueryParams } | undefined,
		fetchOpts?: { cancelInFlight?: boolean } | undefined,
	) => {
		if (fetchOpts?.cancelInFlight === true) {
			activeAbortController?.abort();
		}
		const controller = new AbortController();
		activeAbortController = controller;
		const requestId = ++latestRequestId;
		return new Promise<void>((resolve) => {
			const opts =
				typeof options === "function"
					? options({
							data: value.get().data,
							error: value.get().error,
							isPending: value.get().isPending,
						})
					: options;

			let timeoutId: ReturnType<typeof setTimeout> | undefined;
			if (opts?.timeout && typeof setTimeout !== "undefined") {
				timeoutId = setTimeout(() => {
					controller.abort(
						new DOMException("The operation timed out.", "TimeoutError"),
					);
				}, opts.timeout);
			}

			let onAbort: (() => void) | undefined;
			if (opts?.signal) {
				if (opts.signal.aborted) {
					controller.abort(opts.signal.reason);
				} else {
					onAbort = () => controller.abort(opts.signal?.reason);
					opts.signal.addEventListener("abort", onAbort, { once: true });
				}
			}

			$fetch<T>(path, {
				...opts,
				query: {
					...opts?.query,
					...queryParams?.query,
				},
				signal: controller.signal,
				async onSuccess(context) {
					if (requestId === latestRequestId) {
						const current = value.get();
						const stableData =
							current.data != null &&
							context.data != null &&
							isJsonEqual(current.data, context.data)
								? current.data
								: context.data;
						value.set({
							data: stableData,
							error: null,
							isPending: false,
							isRefetching: false,
							refetch: value.value.refetch,
						});
					}
					await opts?.onSuccess?.(context);
				},
				async onError(context) {
					const { request } = context;
					const retryAttempts =
						typeof request.retry === "number"
							? request.retry
							: request.retry?.attempts;
					const retryAttempt = request.retryAttempt || 0;
					if (retryAttempts && retryAttempt < retryAttempts) return;
					if (requestId === latestRequestId) {
						const isUnauthorized = context.error.status === 401;
						value.set({
							error: context.error,
							data: isUnauthorized
								? null // clear session on HTTP 401
								: value.get().data, // preserve stale data on other errors
							isPending: false,
							isRefetching: false,
							refetch: value.value.refetch,
						});
					}
					await opts?.onError?.(context);
				},
				async onRequest(context) {
					if (requestId === latestRequestId) {
						const currentValue = value.get();
						value.set({
							isPending: currentValue.data === null,
							data: currentValue.data,
							error: null,
							isRefetching: true,
							refetch: value.value.refetch,
						});
					}
					await opts?.onRequest?.(context);
				},
			})
				.catch((error) => {
					if (requestId !== latestRequestId) return;
					value.set({
						error,
						data: value.get().data,
						isPending: false,
						isRefetching: false,
						refetch: value.value.refetch,
					});
				})
				.finally(() => {
					if (timeoutId) {
						clearTimeout(timeoutId);
					}
					if (opts?.signal && onAbort) {
						opts.signal.removeEventListener("abort", onAbort);
					}
					if (activeAbortController === controller) {
						activeAbortController = undefined;
					}
					resolve(void 0);
				});
		});
	};

	const value: AuthQueryAtom<T> = createAuthQueryAtom<AuthQueryState<T>>({
		data: null,
		error: null,
		isPending: true,
		isRefetching: false,
		refetch: (queryParams, fetchOpts) => fn(queryParams, fetchOpts),
	});
	onMount(value, () => withEquality(value, isAuthQueryStateEqual));
	initializedAtom = Array.isArray(initializedAtom)
		? initializedAtom
		: [initializedAtom];
	let isMountFetchPending = false;
	let isMounted = false;
	let shouldRefetchAfterPending = false;

	const fetchOnMount = () => {
		if (isMountFetchPending) {
			shouldRefetchAfterPending = true;
			return;
		}
		isMountFetchPending = true;
		void fn().finally(() => {
			isMountFetchPending = false;
			const shouldRefetch = shouldRefetchAfterPending && isMounted;
			shouldRefetchAfterPending = false;
			if (shouldRefetch) fetchOnMount();
		});
	};

	onMount(value, () => {
		if (isServer()) {
			// On server, don't trigger fetch
			return;
		}

		isMounted = true;
		let isInitialized = false;
		let timeoutId: ReturnType<typeof setTimeout>;
		const cleanups = initializedAtom.map((initAtom) =>
			initAtom.listen(() => {
				if (isInitialized) {
					void fn();
				} else {
					isInitialized = true;
					clearTimeout(timeoutId);
					fetchOnMount();
				}
			}),
		);
		timeoutId = setTimeout(() => {
			isInitialized = true;
			fetchOnMount();
		}, 0);

		return () => {
			isMounted = false;
			for (const cleanup of cleanups) cleanup();
			clearTimeout(timeoutId);
		};
	});
	return value;
};
