import { auth } from "@/lib/auth";
import { isSCIMDemoEnabled } from "@/lib/scim-demo";
import {
	exchangeSCIMDemoOIDCAuthorizationCode,
	getSCIMDemoOIDCError,
} from "@/lib/scim-demo-oidc";

export const runtime = "nodejs";

export async function POST(request: Request) {
	if (!isSCIMDemoEnabled()) {
		return Response.json({ error: "not_found" }, { status: 404 });
	}
	try {
		const context = await auth.$context;
		const response = await exchangeSCIMDemoOIDCAuthorizationCode(
			context.internalAdapter,
			new URLSearchParams(await request.text()),
		);
		return Response.json(response, {
			headers: {
				"cache-control": "no-store",
				pragma: "no-cache",
			},
		});
	} catch (error) {
		const failure = getSCIMDemoOIDCError(error);
		return Response.json(
			{ error: failure.code, error_description: failure.message },
			{
				status: failure.status,
				headers: {
					"cache-control": "no-store",
					pragma: "no-cache",
					...(failure.status === 401
						? { "www-authenticate": 'Basic realm="SCIM demo OIDC"' }
						: {}),
				},
			},
		);
	}
}
