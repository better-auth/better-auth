import { createRouter } from "better-call";
import { signInOAuth, callbackOAuth, signUpOAuth } from "./endpoints/";
import { AuthContext } from "../init";

export const router = (ctx: AuthContext) => {
	return createRouter([signInOAuth, signUpOAuth, callbackOAuth], {
		extraContext: ctx,
		basePath: ctx.options.basePath,
	});
};
