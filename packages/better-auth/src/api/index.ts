import { createRouter } from "better-call";
import { signInOAuth, callbackOAuth } from "./routes";
import { AuthContext } from "../init";

export const router = (ctx: AuthContext) => {
	return createRouter(
		{
			signInOAuth,
			callbackOAuth,
		},
		{
			extraContext: ctx,
			basePath: ctx.options.basePath,
		},
	);
};
