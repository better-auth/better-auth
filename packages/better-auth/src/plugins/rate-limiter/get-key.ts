import { getSession } from "../../api/routes";
import { BetterAuthError } from "../../error/better-auth-error";
import { getIp } from "../../utils/get-request-ip";
import { logger } from "../../utils/logger";

export async function getRateLimitKey(req: Request) {
	if (req.headers.get("Authorization") || req.headers.get("cookie")) {
		try {
			const session = await getSession({
				headers: req.headers,
				// @ts-ignore
				_flag: undefined,
			});
			if (session) {
				return session.user.id;
			}
		} catch (e) {
			return "";
		}
	}
	const ip = getIp(req);
	if (!ip) {
		throw new BetterAuthError("IP not found");
	}
	return ip;
}
