export {
	type AuthEndpointContext,
	getCurrentAuthContext,
	getCurrentAuthContextAsyncLocalStorage,
	runWithEndpointContext,
} from "./endpoint-context";
export {
	defineRequestState,
	getCurrentRequestState,
	getRequestStateAsyncLocalStorage,
	hasRequestState,
	type RequestState,
	type RequestStateWeakMap,
	runWithRequestState,
} from "./request-state";
export {
	getCurrentAdapter,
	getCurrentDBAdapterAsyncLocalStorage,
	runWithAdapter,
	runWithTransaction,
} from "./transaction";

const glo: any =
	typeof globalThis !== "undefined"
		? globalThis
		: typeof window !== "undefined"
			? window
			: typeof global !== "undefined"
				? global
				: {};

const importIdentifier = "__ $BETTER_AUTH$ __";

if (glo[importIdentifier] === true) {
	/**
	 * Dear reader of this message. Please take this seriously.
	 *
	 * If you see this message, make sure that you only import one version of Better Auth. In many cases,
	 * your package manager installs two versions of Better Auth that are used by different packages within your project.
	 *
	 * This often leads to issues that are hard to debug. We often need to ensure async local storage instance,
	 * If you imported different versions of Better Auth, it is impossible for us to
	 * do status synchronization per request anymore - which might break the states.
	 *
	 */
	console.error(
		"Better Auth was already imported. This breaks async local storage instance and will lead to issues!",
	);
}
glo[importIdentifier] = true;
