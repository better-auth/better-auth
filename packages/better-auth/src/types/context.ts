import type { EndpointContext, InputContext } from "better-call";
import type { AuthContext } from "../init";

export type HookEndpointContext = EndpointContext<string, any> &
	Omit<InputContext<string, any>, "method"> & {
		context: AuthContext & {
			returned?: unknown;
			responseHeaders?: Headers;
		};
		headers?: Headers;
	};

export type GenericEndpointContext = EndpointContext<string, any> & {
	context: AuthContext;
};
