import { getSession } from "../../api/routes";
import { BetterAuthError } from "../../error/better-auth-error";
import { getIp } from "../../utils/get-request-ip";

export async function getRateLimitKey(req: Request) {
	if (req.headers.get("Authorization") || req.headers.get("cookie")) {
		const session = await getSession({
			headers: req.headers,
		});
		if (session) {
			return session.user.id;
		}
	}
	const ip = getIp(req);
	if (!ip) {
		throw new BetterAuthError("IP not found");
	}
	return ip;
}
