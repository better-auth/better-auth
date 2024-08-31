<template>
    <div style="">
        <button v-if="!client.useSession().value" @click="() => client.signIn.social({
            provider: 'github'
        })">
            Continue with github
        </button>
        <div>
            <pre>{{ client.useSession().value }}</pre>
            <button v-if="client.useSession().value" @click="client.signOut()">
                Sign out
            </button>
        </div>
    </div>
</template>