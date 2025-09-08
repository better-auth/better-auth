import { client } from "../lib/auth-client";

export default function Home() {
	const session = client.useSession();
	return (
		<main data-testid="home">
			<div>
				<p>
					Session status:{" "}
					{session().data?.session.id ? "Logged in" : "Not logged in"}
				</p>
			</div>
		</main>
	);
}
