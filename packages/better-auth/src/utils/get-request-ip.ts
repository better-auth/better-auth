import { isTest } from "../utils/env";

export function getIp(req: Request | Headers): string | null {
	const testIP = "127.0.0.1";
	if (isTest) {
		return testIP;
	}
	const keys = [
		"x-client-ip",
		"x-forwarded-for",
		"cf-connecting-ip",
		"fastly-client-ip",
		"x-real-ip",
		"x-cluster-client-ip",
		"x-forwarded",
		"forwarded-for",
		"forwarded",
	];
	const headers = req instanceof Request ? req.headers : req;
	for (const key of keys) {
		const value = headers.get(key);
		if (typeof value === "string") {
			const ip = value.split(",")[0].trim();
			if (ip) return ip;
		}
	}
	return null;
}
