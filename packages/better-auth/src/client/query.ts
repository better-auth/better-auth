import type { ClientFetchOption } from "@better-auth/core";
import type { BetterFetch, BetterFetchError } from "@better-fetch/fetch";
import type { PreinitializedWritableAtom } from "nanostores";
import { onMount } from "nanostores";
import { bindAuthChange } from "./auth-change";
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
	const value: AuthQueryAtom<T> = createAuthQueryAtom<AuthQueryState<T>>({
		data: null,
		error: null,
		isPending: true,
		isRefetching: false,
		refetch: (queryParams) => fn(queryParams),
	});
	onMount(value, () => withEquality(value, isAuthQueryStateEqual));
	let latestRequestId = 0;
	let pending: Promise<void> | undefined;

	const settle = (result: Pick<AuthQueryState<T>, "data" | "error">) => {
		// During a sign-in, missing data may predate the new credentials.
		if (result.data === null && isIdentityChanging()) {
			value.set({
				...value.get(),
				isRefetching: false,
			});
			return;
		}
		value.set({
			...result,
			isPending: false,
			isRefetching: false,
			refetch: value.value.refetch,
		});
	};

	const fn = (queryParams?: { query?: SessionQueryParams } | undefined) => {
		const requestId = ++latestRequestId;
		pending = new Promise<void>((resolve) => {
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
					if (requestId === latestRequestId) {
						const current = value.get();
						const stableData =
							current.data != null &&
							context.data != null &&
							isJsonEqual(current.data, context.data)
								? current.data
								: context.data;
						settle({
							data: stableData,
							error: null,
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
						settle({
							error: context.error,
							data: isUnauthorized
								? null // clear session on HTTP 401
								: value.get().data, // preserve stale data on other errors
						});
					}
					await opts?.onError?.(context);
				},
				async onRequest(context) {
					if (requestId === latestRequestId) {
						const currentValue = value.get();
						value.set({
							isPending: currentValue.isPending,
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
					settle({
						error,
						data: value.get().data,
					});
				})
				.finally(() => {
					resolve(void 0);
				});
		});
		return pending;
	};
	initializedAtom = Array.isArray(initializedAtom)
		? initializedAtom
		: [initializedAtom];
	const isIdentityChanging = bindAuthChange(
		initializedAtom,
		value,
		() => pending,
	);
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
