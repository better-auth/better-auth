"use client";

import { authClient } from "@/lib/auth-client";

export default function ClientSessionPage() {
	const { data, isPending } = authClient.useSession();

	return (
		<main>
			<p data-testid="session-email">
				{isPending
					? "Loading session"
					: (data?.user.email ?? "No active session")}
			</p>
		</main>
	);
}
