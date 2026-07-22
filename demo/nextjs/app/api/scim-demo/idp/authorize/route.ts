import { auth } from "@/lib/auth";
import { getSCIMDemoBaseURL, isSCIMDemoEnabled } from "@/lib/scim-demo";
import {
	getSCIMDemoOIDCAuthorizationPageURL,
	getSCIMDemoOIDCAuthorizationView,
	getSCIMDemoOIDCError,
	issueSCIMDemoOIDCAuthorizationCode,
} from "@/lib/scim-demo-oidc";

export const runtime = "nodejs";

function oauthError(error: unknown) {
	const failure = getSCIMDemoOIDCError(error);
	return Response.json(
		{ error: failure.code, error_description: failure.message },
		{
			status: failure.status,
			headers: {
				"cache-control": "no-store",
				...(failure.status === 401
					? { "www-authenticate": 'Basic realm="SCIM demo OIDC"' }
					: {}),
			},
		},
	);
}

export function GET(request: Request) {
	if (!isSCIMDemoEnabled()) {
		return Response.json({ error: "not_found" }, { status: 404 });
	}
	const view = getSCIMDemoOIDCAuthorizationView(
		new URL(request.url).searchParams,
	);
	if (view.status === "invalid") {
		return Response.json(
			{ error: "invalid_request", error_description: view.message },
			{ status: 400, headers: { "cache-control": "no-store" } },
		);
	}
	return Response.redirect(
		getSCIMDemoOIDCAuthorizationPageURL(view.request),
		302,
	);
}

export async function POST(request: Request) {
	if (!isSCIMDemoEnabled()) {
		return Response.json({ error: "not_found" }, { status: 404 });
	}
	if (request.headers.get("origin") !== getSCIMDemoBaseURL()) {
		return Response.json(
			{
				error: "access_denied",
				error_description: "Cross-origin authorization is not allowed",
			},
			{ status: 403, headers: { "cache-control": "no-store" } },
		);
	}
	const form = new URLSearchParams(await request.text());
	try {
		const context = await auth.$context;
		const callback = await issueSCIMDemoOIDCAuthorizationCode(
			context.internalAdapter,
			form,
			{
				workspaceId: form.get("workspace_id") ?? "",
				userKey: form.get("user_key") ?? "",
			},
		);
		return Response.redirect(callback, 303);
	} catch (error) {
		return oauthError(error);
	}
}
