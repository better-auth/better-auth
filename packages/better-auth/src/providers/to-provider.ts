import { OAuth2Provider, OAuth2ProviderWithPKCE } from "arctic";
import { Constructor } from "type-fest";
import { LiteralString } from "../types/helper";
import { OAuthUserInfo } from "../types/provider";

export interface ProviderOptions {
	clientId: string;
	clientSecret: string;
}

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
