<script lang="ts">;
export default {
    setup() {
        const organizations = client.useListOrganizations();
        const activeOrganization = client.useActiveOrganization();
        return { organizations, activeOrganization };
    }
};
</script>

<template>
    <div>
        <h1>Organizations</h1>
        <div v-if="organizations.isPending">Loading...</div>
        <div v-else-if="organizations.data === null">No organizations found.</div>
        <ul v-else>
            <li v-for="organization in organizations.data" :key="organization.id">
                {{ organization.name }}
            </li>
        </ul>

        <h2>Active organization</h2>
        <div v-if="activeOrganization.isPending">Loading...</div>
        <div v-else-if="activeOrganization.data === null">No active organization.</div>
        <div v-else>
            {{ activeOrganization.data.name }}
        </div>
    </div>
</template>