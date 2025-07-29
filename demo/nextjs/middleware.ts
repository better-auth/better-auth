import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { getOrgAdapter } from "../../packages/better-auth/src/plugins/organization/adapter";
import { auth } from "./lib/auth";

export async function middleware(request: NextRequest) {
    const hostname = request.headers.get("host");

    if (hostname) {
        const orgAdapter = getOrgAdapter(auth.context, {});
        const organization = await orgAdapter.findOrganizationByDomain(hostname);

        if (organization && organization.customDomainVerified) {
            const url = request.nextUrl.clone();
            url.pathname = `/org/${organization.slug}${url.pathname}`;
            return NextResponse.rewrite(url);
        }
    }

	const cookies = getSessionCookie(request);
	if (!cookies) {
		return NextResponse.redirect(new URL("/", request.url));
	}
	return NextResponse.next();
}

export const config = {
	matcher: ["/dashboard"],
};
