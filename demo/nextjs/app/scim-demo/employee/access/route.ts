import { auth } from "@/lib/auth";
import { isSCIMDemoEmployeePortalEnabled } from "@/lib/scim-demo";
import { consumeSCIMDemoEmployeeAccessGrant } from "@/lib/scim-demo-employee";

export const runtime = "nodejs";

const RESPONSE_HEADERS = {
	"cache-control": "private, no-store",
	"referrer-policy": "no-referrer",
	"x-content-type-options": "nosniff",
} as const;

export async function GET(request: Request) {
	if (!isSCIMDemoEmployeePortalEnabled()) {
		return new Response("Not found", {
			status: 404,
			headers: RESPONSE_HEADERS,
		});
	}
	const grant = new URL(request.url).searchParams.get("grant") ?? "";
	const context = await auth.$context;
	const portal = await consumeSCIMDemoEmployeeAccessGrant(
		context.adapter,
		context.internalAdapter,
		grant,
	);
	if (!portal) {
		return new Response("Not found", {
			status: 404,
			headers: RESPONSE_HEADERS,
		});
	}
	return new Response(null, {
		status: 303,
		headers: {
			...RESPONSE_HEADERS,
			location: "/scim-demo/employee",
			"set-cookie": portal.cookie,
		},
	});
}
