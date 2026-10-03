<script setup lang="ts">
import { authClient } from "~~/lib/auth-client";

// biome-ignore lint/correctness/noUnusedVariables: Used in the template.
const { data: session } = await authClient.useSession(useFetch);
</script>

<template>
	<main>
		<h1 v-if="session">Signed in as {{ session.user.name }}</h1>
		<h1 v-else>Signed out</h1>
	</main>
</template>
