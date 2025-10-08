import { parseCookies } from "../cookies";
import type { AuthContext, AuthPluginSchema } from "../types";

export const checkAuthCookie = async <S extends AuthPluginSchema>(
	request: Request | Headers,
	auth: {
		$context: Promise<AuthContext<S>>;
	},
) => {
	const headers = request instanceof Headers ? request : request.headers;
	const cookies = headers.get("cookie");
	if (!cookies) {
		return null;
	}
	const ctx = await auth.$context;
	const cookieName = ctx.authCookies.sessionToken.name;
	const parsedCookie = parseCookies(cookies);
	const sessionToken = parsedCookie.get(cookieName);
	if (sessionToken) {
		return sessionToken;
	}
	return null;
};
