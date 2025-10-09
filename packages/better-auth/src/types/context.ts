import type { EndpointContext, InputContext } from "better-call";
import type { AuthContext } from "@better-auth/core";

export type HookEndpointContext = EndpointContext<string, any> &
	Omit<InputContext<string, any>, "method"> & {
		context: AuthContext & {
			returned?: unknown;
			responseHeaders?: Headers;
		};
		headers?: Headers;
	};
