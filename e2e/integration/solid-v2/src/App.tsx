import { createMemo, Loading, onSettled, Show } from "solid-js";
import { client } from "./lib/auth-client";
import { getServerSession } from "./lib/session";

export default function App() {
	const serverSession = createMemo(() => getServerSession());
	const session = client.useSession(serverSession);
	onSettled(() => {
		window.client = client;
	});
	return (
		<main>
			<Loading fallback={<p>Loading session…</p>}>
				<Show when={session()} fallback={<a href="/sign-in">Sign in</a>}>
					{(current) => <h1>Signed in as {current().user.name}</h1>}
				</Show>
			</Loading>
			<p>Ready</p>
		</main>
	);
}
