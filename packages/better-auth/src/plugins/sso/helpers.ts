import { jwtVerify } from "jose";

export async function verifySCIMToken(
	authHeader: string,
	secret: string,
): Promise<{ orgId: string; scope?: string }> {
	const token = authHeader.replace(/^Bearer /i, "");

	const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));

	if (payload.type !== "scim" || !payload.orgId) {
		throw new Error("Invalid SCIM token");
	}

	return payload as { orgId: string; scope?: string };
}
