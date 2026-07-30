import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export default async function SessionPage() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	return (
		<main>
			<p data-testid="session-email">
				{session?.user.email ?? "No active session"}
			</p>
		</main>
	);
}
