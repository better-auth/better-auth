<script lang="ts">
	import { client, session } from '$lib/auth/client';
</script>

<div>
	{#if $session}
		<h1>Welcome {$session.firstName} {$session.lastName}</h1>
		<p>{$session.email}</p>
		<button
			on:click={async () => {
				await client.signOut();
				session.set(null);
			}}>Sign Out</button
		>
	{:else}
		<h1>Sign In</h1>
	{/if}
</div>

<button
	on:click={async () => {
		await client.signInOrSignUp({
			provider: 'github',
			signUp: {
				firstName: {
					from: 'first_name'
				},
				lastName: {
					from: 'last_name'
				}
			}
		});
	}}
>
	Continue with Github
</button>
