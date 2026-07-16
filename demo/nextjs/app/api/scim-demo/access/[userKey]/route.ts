import { auth } from "@/lib/auth";
import { getSCIMDemoBaseURL, isSCIMDemoEnabled } from "@/lib/scim-demo";
import { SCIM_DEMO_USER_KEYS } from "@/lib/scim-demo-catalog";
import type { SCIMDemoUserKey } from "@/lib/scim-demo-contract";
import { checkSCIMDemoAccess, getSCIMDemoError } from "@/lib/scim-demo-service";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
	return Response.json(
		{ error: message },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

function isUserKey(value: string): value is SCIMDemoUserKey {
	return SCIM_DEMO_USER_KEYS.some((userKey) => userKey === value);
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ userKey: string }> },
) {
	if (!isSCIMDemoEnabled()) return jsonError("SCIM demo not found", 404);
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) return jsonError("Authentication required", 401);
	const { userKey } = await params;
	if (!isUserKey(userKey)) return jsonError("Directory user not found", 404);

	try {
		const context = await auth.$context;
		const decision = await checkSCIMDemoAccess(
			{
				baseURL: getSCIMDemoBaseURL(),
				database: context.adapter,
				operatorId: session.user.id,
			},
			userKey,
		);
		return Response.json(decision, {
			status: decision.allowed ? 200 : 403,
			headers: { "cache-control": "no-store" },
		});
	} catch (error) {
		const failure = getSCIMDemoError(error);
		return jsonError(failure.message, failure.status);
	}
}
