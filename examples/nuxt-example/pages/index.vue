<script setup lang="ts">
const features = ["social sign-in", "email and password", "two-factor"]
import { Button } from '@/components/ui/button';
import { useSession } from "~/lib/auth-client";

definePageMeta({
    layout: "default"
})

const session = useSession()
</script>

<template>
    <div class="min-h-[80vh] flex items-center justify-center overflow-hidden no-visible-scrollbar px-6 md:px-0">
        <main class="flex flex-col gap-4 row-start-2 items-center justify-center">
            <div class="flex flex-col gap-1">
                <h3 class="font-bold text-4xl text-black dark:text-white text-center">
                    Better Auth.
                </h3>

                <p class="text-center">
                    Official <span class="italic underline">better-auth</span> Svelte-Kit demo
                </p>

                <div class="flex flex-col gap-3 pt-2 flex-wrap">
                    <div class="border-y py-2 border-dotted bg-secondary/60 opacity-80">
                        <div class="text-xs flex items-center gap-2 justify-center text-muted-foreground">
                            <span class="text-center">
                                All features on this demo are Implemented with better auth without
                                any custom backend code
                            </span>
                        </div>
                    </div>
                    <div class="flex gap-2 justify-center flex-wrap">
                        <div v-for="feature in features" :key="feature">
                            <span
                                class="border-b pb-1 text-muted-foreground text-xs cursor-pointer hover:text-foreground duration-150 ease-in-out transition-all hover:border-foreground flex items-center gap-1">{{
                                    feature }}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2 mt-2 mx-auto">
                    <NuxtLink to="/sign-in" v-if="!session.data">
                        <Button variant="outline" class="rounded-none">
                            Sign In
                        </Button>
                    </NuxtLink>
                    <NuxtLink to="/dashboard">
                        <Button variant="outline" class="rounded-none" v-if="session.data">
                            Dashboard
                        </Button>
                    </NuxtLink>
                </div>
            </div>
        </main>
    </div>
</template>
