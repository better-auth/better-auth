import { isSCIMDemoEnabled } from "@/lib/scim-demo";
import { getSCIMDemoOIDCDiscoveryDocument } from "@/lib/scim-demo-oidc";

export const runtime = "nodejs";

export function GET() {
	if (!isSCIMDemoEnabled()) {
		return Response.json({ error: "not_found" }, { status: 404 });
	}
	return Response.json(getSCIMDemoOIDCDiscoveryDocument(), {
		headers: { "cache-control": "no-store" },
	});
}
