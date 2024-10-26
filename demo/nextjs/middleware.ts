import { client } from "@/lib/auth-client";
import { NextRequest, NextResponse } from "next/server";

export default async function authMiddleware(request: NextRequest) {
    const { data: session } = await client.getSession({
        fetchOptions: {
            headers: {
                //get the cookie from the request
                cookie: request.headers.get("cookie") || "",
            },
        },
    });

    if (!session) {
        return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
}

export const config = {
	matcher: ["/dashboard"],
};
