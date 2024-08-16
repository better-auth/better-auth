import { GitHub, Google, OAuth2Provider, OAuth2ProviderWithPKCE } from "arctic";
import { Constructor } from "type-fest";
import { LiteralString } from "../types/helper";
import { TokenResponseBody } from "oslo/oauth2";
import { z, ZodSchema } from "zod";
import { OAuthUserInfo, Provider } from "./types";

type ProviderOptions = {
	clientId: string;
	clientSecret: string;
};

export const toBetterAuthProvider = <
	C extends Constructor<OAuth2Provider | OAuth2ProviderWithPKCE>,
	ID extends LiteralString,
	UInfo extends OAuthUserInfo,
>(
	id: ID,
	instance: C,
	userInfo: UInfo,
) => {
	type CParam = ConstructorParameters<C>[2];
	type Options = CParam extends string
		? {
				redirectURI?: CParam;
			}
		: CParam;

	return (params: ProviderOptions, options?: Options) => {
		return {
			id: id,
			type: "oauth2" as const,
			provider: new instance(params.clientId, params.clientSecret, options),
			userInfo: userInfo,
		};
	};
};

export const github = toBetterAuthProvider("github", GitHub, {
	endpoint: "https://api.github.com/user",
	schema: z.object({
		id: z.string(),
		login: z.string(),
		name: z.string(),
		email: z.string(),
		avatar_url: z.string(),
	}),
});

export const google = toBetterAuthProvider("google", Google, {
	endpoint: "https://www.googleapis.com/oauth2/v3/userinfo",
	schema: z.object({
		sub: z.string(),
		name: z.string(),
		given_name: z.string(),
		family_name: z.string(),
		picture: z.string(),
		email: z.string(),
	}),
});

export const providers = {
	github,
	google,
};

export const providerList = Object.keys(providers) as [
	"github",
	...(keyof typeof providers)[],
];
