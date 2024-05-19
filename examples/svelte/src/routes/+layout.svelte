<script lang="ts">
	import { client, session } from '$lib/auth/client';
	import { onMount } from 'svelte';

	onMount(async () => {
		const data = await client.getSession();
		session.set(data);
	});
</script>

<slot />
