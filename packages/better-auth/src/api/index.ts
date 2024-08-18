import { createRouter } from "better-call";
import { signInOAuth, callbackOAuth } from "./routes";
import { AuthContext } from "../init";
import { csrfMiddleware } from "./middlewares/csrf";
import { getCSRFToken } from "./routes/csrf";

export const router = (ctx: AuthContext) => {
	return createRouter(
		{
			signInOAuth,
			callbackOAuth,
			getCSRFToken
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
