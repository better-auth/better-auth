import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export interface APIData {
	message: string;
	user: {
		id: string;
		email: string;
		name: string | null | undefined;
		image: string | null | undefined;
	};
	session: {
		expiresAt: Date;
		createdAt: Date;
	};
	note: string;
}

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
	} satisfies APIData);
}
