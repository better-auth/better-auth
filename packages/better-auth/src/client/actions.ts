import { BetterAuth } from "../auth";

export function getSignInOAuth<Auth extends BetterAuth = BetterAuth>(
	impl: (ctx: any) => Promise<any>,
) {
	return signInOAuth;
}
