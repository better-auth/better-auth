import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	return Response.json({
		message: "Server-side session access works!",
		user: {
			id: session.user.id,
			name: session.user.name,
			email: session.user.email,
			image: session.user.image,
		},
		session: {
			expiresAt: session.session.expiresAt,
			createdAt: session.session.createdAt,
		},
		note: "This data was retrieved from JWT on the server without any database queries.",
	});
}
