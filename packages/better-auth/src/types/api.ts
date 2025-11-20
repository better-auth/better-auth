import type { Endpoint } from "better-call";
import type { PrettifyDeep, UnionToIntersection } from "../types/helper";

export type InferSessionAPI<API> = API extends {
	[key: string]: infer E;
}
	? UnionToIntersection<
			E extends Endpoint
				? E["options"]["metadata"] extends { scope: "http" }
					? never
					: E["path"] extends "/get-session"
						? {
								getSession: <
									R extends boolean,
									H extends boolean = false,
								>(context: {
									params: any;
									headers: Headers;
									query?:
										| {
												disableCookieCache?: boolean;
												disableRefresh?: boolean;
										  }
										| undefined;
									asResponse?: R | undefined;
									returnHeaders?: H | undefined;
								}) => false extends R
									? H extends true
										? Promise<{
												headers: Headers;
												response: PrettifyDeep<Awaited<ReturnType<E>>> | null;
											}>
										: Promise<PrettifyDeep<Awaited<ReturnType<E>>> | null>
									: Promise<Response>;
							}
						: never
				: never
		>
	: never;

export type InferAPI<API> = InferSessionAPI<API> & API;
