import type { AuthContext } from "@better-auth/core";
import type { EndpointContext, InputContext } from "better-call";

export type HookEndpointContext = EndpointContext<string, any> &
	Omit<InputContext<string, any>, "method"> & {
		context: AuthContext & {
			returned?: unknown;
			responseHeaders?: Headers;
		};
		headers?: Headers;
	};
