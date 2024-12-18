import type { APIError, ContextTools, EndpointOptions } from "better-call";
import type { AuthContext } from "../init";

export type HookEndpointContext<C extends Record<string, any> = {}> =
	ContextTools & {
		context: AuthContext &
			C & {
				returned?: APIError | Response | Record<string, any>;
			};
	} & {
		body: any;
		request?: Request;
		headers?: Headers;
		params?: Record<string, string> | undefined;
		query?: any;
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
