<script lang="ts">
import type { PageProps } from "./$types";

// biome-ignore lint/correctness/noUnusedVariables: used in the template
let { data }: PageProps = $props();
</script>

{#if data.userName}
	<h1>Signed in as {data.userName}</h1>
{:else}
	<h1>Signed out</h1>
	<form method="POST">
		<input name="name" aria-label="Name" />
		<input name="email" aria-label="Email" />
		<input name="password" type="password" aria-label="Password" />
		<button>Sign up</button>
	</form>
{/if}
