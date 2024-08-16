import { ClientOptions, createBaseClient } from "./base";
import { BetterAuth } from "../auth";
import { getSignInOAuth, getSignUpOAuth } from "./actions";
import { O } from "./type";
import { getProxy } from "./proxy";

export const createAuthClient = <Auth extends BetterAuth = BetterAuth>(
	options?: ClientOptions,
) => {
	const client = createBaseClient(options);
	const actions = {
		signInOAuth: getSignInOAuth<Auth>(client),
		signUpOAuth: getSignUpOAuth<Auth>(async (ctx) => {
			return await client("/signin/oauth", ctx);
		}),
	};
	return getProxy(actions, client) as typeof actions & O<Auth>;
};
