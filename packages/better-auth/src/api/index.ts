import { createRouter } from "better-call";
import { signInOAuth, callbackOAuth, getSession, signOut } from "./routes";
import { AuthContext } from "../init";
import { csrfMiddleware } from "./middlewares/csrf";
import { getCSRFToken } from "./routes/csrf";

export const router = (ctx: AuthContext) => {
	return createRouter(
		{
			signInOAuth,
			callbackOAuth,
			getCSRFToken,
			getSession,
			signOut
		},
		{
			extraContext: ctx,
			basePath: ctx.options.basePath,
			routerMiddleware: [{
				path: "/**",
				middleware: csrfMiddleware
			}]
		},
	);
};
