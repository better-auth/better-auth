import type { EndpointContext, InputContext } from "better-call";
import type { AuthContext } from "../init";
import type { AuthPluginSchema } from "../plugins";

export type HookEndpointContext<S extends AuthPluginSchema> = EndpointContext<
	string,
	any
> &
	Omit<InputContext<string, any>, "method"> & {
		context: AuthContext<S> & {
			returned?: unknown;
			responseHeaders?: Headers;
		};
		headers?: Headers;
	};

export type GenericEndpointContext<S extends AuthPluginSchema> =
	EndpointContext<string, any> & {
		context: AuthContext<S>;
	};
