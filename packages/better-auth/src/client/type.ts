import { Context, Endpoint } from "better-call";
import { CamelCase } from "type-fest";
import {
	Prettify,
	HasRequiredKeys,
	UnionToIntersection,
} from "../types/helper";
import { BetterFetchResponse } from "@better-fetch/fetch";
import { BetterAuth } from "../auth";
import { CustomProvider } from "../providers";

export type InferKeys<T> = T extends `/${infer A}/${infer B}`
	? CamelCase<`${A}-${InferKeys<B>}`>
	: T extends `${infer I}/:${infer _}`
		? I
		: T extends `${infer I}:${infer _}`
			? I
			: T extends `/${infer I}`
				? CamelCase<I>
				: CamelCase<T>;

export type InferActions<Actions> = Actions extends {
	[key: string]: infer T;
}
	? UnionToIntersection<
			T extends Endpoint
				? {
						[key in InferKeys<T["path"]>]: T extends (ctx: infer C) => infer R
							? C extends Context<any, any>
								? (
										...data: HasRequiredKeys<C> extends true
											? [Prettify<C>]
											: [Prettify<C>?]
									) => Promise<BetterFetchResponse<Awaited<R>>>
								: never
							: never;
					}
				: never
		>
	: never;

export type ExcludeCredentialPaths<Auth extends BetterAuth> =
	Auth["options"]["emailAndPassword"] extends {
		enabled: true;
	}
		? ""
		: "signUpCredential" | "signInCredential";

export type ExcludedPasskeyPaths =
	| "passkeyGenerateAuthenticateOptions"
	| "passkeyGenerateRegisterOptions"
	| "verifyPasskey";

export type ExcludedPaths<Auth extends BetterAuth> =
	| "signinOauth"
	| "signUpOauth"
	| "callback"
	| "session"
	| ExcludeCredentialPaths<Auth>
	| ExcludedPasskeyPaths;

export type OrganizationPaths = "$activeOrganization" | "setActiveOrg";

type ProviderEndpoint<Auth extends BetterAuth> = UnionToIntersection<
	Auth["options"]["providers"] extends Array<infer T>
		? T extends CustomProvider
			? T["endpoints"]
			: {}
		: {}
>;

export type Actions<Auth extends BetterAuth> = ProviderEndpoint<Auth> &
	Auth["api"];

export type InferredActions<Auth extends BetterAuth> = Prettify<
	Omit<InferActions<Actions<Auth>>, ExcludedPaths<Auth>>
>;

export type PickOrganizationPaths<Auth extends BetterAuth> =
	Auth["options"]["plugins"] extends Array<infer T>
		? T extends {
				id: "organization";
			}
			? OrganizationPaths
			: never
		: never;

export type PickProvidePaths<
	ID extends string,
	PickedPath extends string,
	Auth extends BetterAuth,
> = Auth["options"]["providers"] extends Array<infer P>
	? P extends {
			id: ID;
		}
		? PickedPath
		: never
	: never;

export type PickDefaultPaths = "$session";
