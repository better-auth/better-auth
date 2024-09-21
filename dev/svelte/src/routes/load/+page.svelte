<script lang="ts">
  import { client } from "$lib/client";

  const organizations = client.useListOrganizations();
  const activeOrganization = client.useActiveOrganization();
</script>

<h1>Organizations</h1>

{#if $organizations.isPending}
  <p>Loading...</p>
{:else if $organizations.data === null}
  <p>No organizations found.</p>
{:else}
  <ul>
    {#each $organizations.data as organization}
      <li>{organization.name}</li>
    {/each}
  </ul>
{/if}

<h2>Active Organization</h2>
