import type { EndpointContext, InputContext } from "better-call";
import type { AuthContext } from "../init";

export type HookEndpointContext<C extends Record<string, any> = {}> =
	InputContext<string, any> & {
		context: AuthContext &
			C & {
				returned?: unknown;
				responseHeaders?: Headers;
			};
		headers?: Headers;
	};

export type GenericEndpointContext = InputContext<string, any> & {
	context: AuthContext;
};
