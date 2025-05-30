import type { Endpoint } from "better-call";
import type { PrettifyDeep, UnionToIntersection } from "../types/helper";

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

export type InferSessionAPI<API> = API extends {
	[key: string]: infer E;
}
	? UnionToIntersection<
			E extends Endpoint
				? E["path"] extends "/get-session"
					? {
							getSession: <R extends boolean>(context: {
								headers: Headers;
								query?: {
									disableCookieCache?: boolean;
									disableRefresh?: boolean;
								};
								asResponse?: R;
							}) => false extends R
								? Promise<PrettifyDeep<Awaited<ReturnType<E>>>> & {
										options: E["options"];
										path: E["path"];
									}
								: Promise<Response>;
						}
					: never
				: never
		>
	: never;

export type InferAPI<API> = InferSessionAPI<API> & FilteredAPI<API>;
