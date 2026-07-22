import { isSCIMDemoEnabled } from "@/lib/scim-demo";
import { getSCIMDemoOIDCJWKS } from "@/lib/scim-demo-oidc";

export const runtime = "nodejs";

export async function GET() {
	if (!isSCIMDemoEnabled()) {
		return Response.json({ error: "not_found" }, { status: 404 });
	}
	return Response.json(await getSCIMDemoOIDCJWKS(), {
		headers: { "cache-control": "no-store" },
	});
}
