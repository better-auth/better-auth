const USER_DENY = new Set([
	"password",
	"twoFactorSecret",
	"twoFactorBackupCodes",
]);

const ACCOUNT_DENY = new Set([
	"accessToken",
	"refreshToken",
	"idToken",
	"password",
]);

const SESSION_DENY = new Set(["token"]);

function omitKeys(
	obj: Record<string, unknown>,
	deny: Set<string>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(obj)) {
		if (deny.has(k)) continue;
		out[k] = v;
	}
	return out;
}

export function sanitizeUserRecord(
	user: Record<string, unknown>,
): Record<string, unknown> {
	return omitKeys(user, USER_DENY);
}

export function sanitizeSessionRecord(
	session: Record<string, unknown>,
): Record<string, unknown> {
	return omitKeys(session, SESSION_DENY);
}

export function sanitizeAccountRecord(
	account: Record<string, unknown>,
): Record<string, unknown> {
	return omitKeys(account, ACCOUNT_DENY);
}
