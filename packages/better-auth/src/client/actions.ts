import { z } from "zod";
import { BetterAuth } from "../auth";
import { InferValueType } from "../db/field";
import { OAuthProvider } from "../provider/types";

export function getSignUpOAuth<Auth extends BetterAuth = BetterAuth>(
	impl: (ctx: any) => Promise<any>,
) {
	async function signUpOAuth<
		ProviderKey extends Auth["options"]["oAuthProviders"] extends Array<infer T>
			? T extends { id: infer Id }
				? Id
				: never
			: never,
		P extends Auth["options"]["oAuthProviders"] extends Array<infer P>
			? P extends OAuthProvider
				? P["id"] extends ProviderKey
					? P
					: never
				: never
			: never,
	>(data: {
		provider: ProviderKey;
		data: {
			[key in keyof Auth["options"]["user"]["fields"]]:
				| keyof z.infer<P["userInfo"]["schema"]>
				| {
						value: InferValueType<
							Auth["options"]["user"]["fields"][key]["type"]
						>;
				  };
		};
	}) {
		return (await impl({
			provider: data.provider,
			data: data.data,
		})) as ReturnType<Auth["api"]["signUpOAuth"]>;
	}
	return signUpOAuth;
}

export function getSignInOAuth<Auth extends BetterAuth = BetterAuth>(
	impl: (ctx: any) => Promise<any>,
) {
	const signInOAuth = async (data: {
		provider: Auth["options"]["oAuthProviders"] extends Array<infer T>
			? T extends { id: infer Id }
				? Id
				: never
			: never;
		callbackURL: string;
	}) => {
		return (await impl({
			provider: data.provider,
			callbackURL: data.callbackURL,
		})) as ReturnType<Auth["api"]["signInOAuth"]>;
	};
	return signInOAuth;
}
