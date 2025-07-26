import { $, component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { authClient } from "~/auth-client";

export default component$(() => {
	const signInWithGithub = $(() => {
		authClient.signIn.social({
			provider: "github",
		});
	});

	return (
		<>
			<h1>Hello People</h1>
			<button onClick$={signInWithGithub}>Sign in with GitHub</button>
		</>
	);
});

export const head: DocumentHead = {
	title: "Welcome to Qwik",
	meta: [
		{
			name: "description",
			content: "Qwik site description",
		},
	],
};
