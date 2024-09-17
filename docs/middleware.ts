import { NextRequest, NextResponse } from "next/server";

export default function middleware(req: NextRequest) {
	if (
		req.nextUrl.pathname.startsWith("/docs") &&
		process.env.NODE_ENV === "production"
	) {
		return NextResponse.redirect(new URL("/", req.url));
	}
	return NextResponse.next();
}

export const config = {
	matcher: "/docs/:path*",
};
