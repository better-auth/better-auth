import { authClient } from "../lib/auth-client";

export default function Home() {
	const session = authClient.useSession();

	return (
		<main>
			<h1>Welcome to SolidStart + Better Auth Test</h1>
			<p>Testing better-auth v1.3.8 integration</p>
			<div>
				<p>Session status: {session() ? "Logged in" : "Not logged in"}</p>
			</div>
		</main>
	);
}
