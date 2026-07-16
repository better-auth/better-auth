import type { UIContext } from "@better-auth/core";
import { parseCookies } from "../../cookies";
import { getUIBasePath } from "../../ui/utils";

async function verifySignedCookieValue(
	signedValue: string,
	secret: string,
): Promise<string | null> {
	const signatureStartPos = signedValue.lastIndexOf(".");
	if (signatureStartPos < 1) return null;
	const value = signedValue.substring(0, signatureStartPos);
	const signature = signedValue.substring(signatureStartPos + 1);
	if (signature.length !== 44 || !signature.endsWith("=")) return null;
	try {
		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["verify"],
		);
		const signatureBinStr = atob(signature);
		const signatureBytes = new Uint8Array(signatureBinStr.length);
		for (let i = 0; i < signatureBinStr.length; i++) {
			signatureBytes[i] = signatureBinStr.charCodeAt(i);
		}
		const valid = await crypto.subtle.verify(
			"HMAC",
			key,
			signatureBytes,
			new TextEncoder().encode(value),
		);
		return valid ? value : null;
	} catch {
		return null;
	}
}

export async function hasActiveUISession(ctx: UIContext): Promise<boolean> {
	const cookieHeader = ctx.request.headers.get("cookie");
	if (!cookieHeader) return false;
	const cookies = parseCookies(cookieHeader);
	const cookieName = ctx.context.authCookies.sessionToken.name;
	const signed =
		cookies.get(cookieName) || cookies.get(`__Secure-${cookieName}`) || null;
	if (!signed) return false;
	const token = await verifySignedCookieValue(signed, ctx.context.secret);
	if (!token) return false;
	const session = await ctx.context.internalAdapter.findSession(token);
	if (!session?.session) return false;
	return new Date(session.session.expiresAt) > new Date();
}

export function uiRedirect(ctx: UIContext, path: string) {
	const base = getUIBasePath(ctx.context.options);
	const normalized = path.startsWith("/") ? path : `/${path}`;
	return new Response(null, {
		status: 302,
		headers: {
			Location: `${base}${normalized}`,
		},
	});
}
