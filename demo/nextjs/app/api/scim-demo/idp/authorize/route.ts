import { auth } from "@/lib/auth";
import {
	getSCIMDemoBaseURL,
	isSCIMDemoEmployeePortalEnabled,
} from "@/lib/scim-demo";
import { resolveSCIMDemoEmployeePortalIdentityForFlow } from "@/lib/scim-demo-employee";
import {
	getSCIMDemoOIDCAuthorizationPageURL,
	getSCIMDemoOIDCAuthorizationView,
	getSCIMDemoOIDCError,
	getSCIMDemoOIDCLoginHint,
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

export async function GET(request: Request) {
	if (!isSCIMDemoEmployeePortalEnabled()) {
		return Response.json({ error: "not_found" }, { status: 404 });
	}
	const context = await auth.$context;
	const searchParams = new URL(request.url).searchParams;
	const identity = await resolveSCIMDemoEmployeePortalIdentityForFlow(
		context.adapter,
		context.internalAdapter,
		request.headers.get("cookie"),
		getSCIMDemoOIDCLoginHint(searchParams),
	);
	if (!identity) {
		return Response.json(
			{ error: "access_denied", error_description: "Sign-in is unavailable" },
			{ status: 400, headers: { "cache-control": "no-store" } },
		);
	}
	const view = await getSCIMDemoOIDCAuthorizationView(searchParams, identity);
	if (view.status === "invalid") {
		return Response.json(
			{
				error: view.error.code,
				error_description: view.error.message,
			},
			{
				status: view.error.status,
				headers: { "cache-control": "no-store" },
			},
		);
	}
	return Response.redirect(
		getSCIMDemoOIDCAuthorizationPageURL(view.request),
		302,
	);
}

export async function POST(request: Request) {
	if (!isSCIMDemoEmployeePortalEnabled()) {
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
		const identity = await resolveSCIMDemoEmployeePortalIdentityForFlow(
			context.adapter,
			context.internalAdapter,
			request.headers.get("cookie"),
			getSCIMDemoOIDCLoginHint(form),
		);
		if (!identity) {
			return Response.json(
				{ error: "access_denied", error_description: "Sign-in is unavailable" },
				{ status: 400, headers: { "cache-control": "no-store" } },
			);
		}
		const callback = await issueSCIMDemoOIDCAuthorizationCode(
			context.internalAdapter,
			form,
			identity,
		);
		return Response.redirect(callback, 303);
	} catch (error) {
		return oauthError(error);
	}
}
