import { createEffect } from "solid-js";
import { client } from "../lib/auth-client";

export default function Home() {
	createEffect(() => {
		window.client = client;
	});
	return (
		<main>
			<div>Ready</div>
		</main>
	);
}
