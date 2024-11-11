import type { ContextTools, EndpointOptions } from "better-call";
import type { AuthContext } from "../init";

export type HookEndpointContext<C extends Record<string, any> = {}> =
	ContextTools & {
		context: AuthContext & C;
	} & {
		body: any;
		request?: Request;
		headers?: Headers;
		params?: Record<string, string> | undefined;
		query?: any;
		returned: unknown;
		returnedHeaders: Headers;
		endpointOptions: EndpointOptions;
		method?: any;
	};

export type GenericEndpointContext = ContextTools & {
	context: AuthContext;
} & {
	body?: any;
	request?: Request;
	headers?: Headers;
	params?: Record<string, string> | undefined;
	query?: any;
	method?: any;
};
