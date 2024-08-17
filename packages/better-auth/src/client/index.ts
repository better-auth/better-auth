import { ClientOptions, createBaseClient } from "./base";
import { BetterAuth } from "../auth";
import { O } from "./type";
import { getProxy } from "./proxy";
import { ProviderList } from "../providers";

export const createAuthClient = <Auth extends BetterAuth = BetterAuth>(
	options?: ClientOptions,
) => {
	const client = createBaseClient(options);
	const signInOAuth = async (data: {
		provider: Auth["options"]["oAuthProviders"] extends Array<infer T>
			? T extends { id: infer Id }
				? Id
				: never
			: ProviderList[number];
		callbackURL: string;
	}) => {
		return await client("/signin/oauth", {
			method: "POST",
			body: data,
		});
	};
	const actions = {
		signInOAuth,
	};
	return getProxy(actions, client) as typeof actions & O<Auth>;
};
