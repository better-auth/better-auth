import { authClient } from "../lib/auth-client";

export default function Home() {
	const session = authClient.useSession();
	return (
		<main data-testid="home">
			<div>
				<p>Session status: {session() ? "Logged in" : "Not logged in"}</p>
			</div>
		</main>
	);
}
