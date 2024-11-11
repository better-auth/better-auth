import type { ContextTools, Endpoint, EndpointOptions } from "better-call";
import type { AuthContext } from "../init";

export type GenericEndpointContext<C extends Record<string, any> = {}> =
	ContextTools & {
		context: AuthContext & C;
	} & {
		body?: any;
		request?: Request;
		headers?: Headers;
		params?: Record<string, string> | undefined;
		query?: any;
		method?: any;
	};
