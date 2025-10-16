import type { StrictEndpoint, EndpointOptions, Endpoint } from "better-call";
import type { UnionToIntersection } from "./helper";
import { type InputContext } from "better-call";

export type FilteredAPI<API> = Omit<
	API,
	API extends { [key in infer K]: Endpoint }
		? K extends string
			? K extends "getSession"
				? K
				: API[K]["options"]["metadata"] extends { isAction: false }
					? K
					: never
			: never
		: never
>;

export type FilterActions<API> = Omit<
	API,
	API extends { [key in infer K]: Endpoint }
		? K extends string
			? API[K]["options"]["metadata"] extends { isAction: false }
				? K
				: never
			: never
		: never
>;

interface GetSessionFn<
	Path extends string,
	Options extends EndpointOptions,
	R = any,
> {
	(
		context: InputContext<Path, Options> & {
			headers: Headers;
			asResponse: true;
		},
	): Promise<Response>;
	(
		context: InputContext<Path, Options> & {
			headers: Headers;
			asResponse: false;
			returnHeaders?: false;
		},
	): Promise<R>;
	(
		context: InputContext<Path, Options> & {
			headers: Headers;
			asResponse?: false;
			returnHeaders: true;
		},
	): Promise<{
		headers: Headers;
		response: Awaited<R>;
	}>;
	(
		context: InputContext<Path, Options> & {
			headers: Headers;
		},
	): Promise<R>;
}

export type InferSessionAPI<API> = API extends {
	[key: string]: infer E;
}
	? UnionToIntersection<
			E extends StrictEndpoint<infer P, infer O, infer R>
				? P extends "/get-session"
					? {
							getSession: GetSessionFn<P, O, R>;
						}
					: never
				: never
		>
	: never;

export type InferAPI<API> = InferSessionAPI<API> & API;
