import type { GenericEndpointContext } from "better-auth";
import { matchesAnyRoute } from "../routes-matcher";
import { routes } from "./constants";

const loginPaths = [
	routes.SIGN_IN_SOCIAL_CALLBACK,
	routes.SIGN_IN_OAUTH_CALLBACK,
	routes.SIGN_IN_EMAIL,
	routes.SIGN_IN_SOCIAL,
	routes.SIGN_IN_EMAIL_OTP,
	routes.SIGN_UP_EMAIL,
];

export const getLoginMethod = (ctx: GenericEndpointContext) => {
	if (matchesAnyRoute(ctx.path, loginPaths)) {
		return ctx.params?.id
			? (ctx.params.id as string)
			: ctx.path.split("/").pop();
	}
	return null;
};
