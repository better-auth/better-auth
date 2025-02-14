<script setup lang="ts">
import { signIn } from "~/lib/auth-client.js";

const email = ref("");
const password = ref("");

const handleSignIn = async () => {
	await signIn.email(
		{
			email: email.value,
			password: password.value,
			callbackURL: "/",
		},
		{
			onError(context) {
				alert(context.error.message);
			},
		},
	);
};
</script>

<template>
    <div class="h-screen flex justify-center items-center">
        <Card class="mx-auto max-w-sm">
            <CardHeader>
                <CardTitle class="text-2xl">
                    Login
                </CardTitle>
                <CardDescription>
                    Enter your email below to login to your account
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div class="grid gap-4">
                    <div class="grid gap-2">
                        <Label for="email">Email</Label>
                        <Input id="email" type="email" placeholder="m@example.com" v-model="email" required />
                    </div>
                    <div class="grid gap-2">
                        <div class="flex items-center">
                            <Label for="password">Password</Label>
                            <a href="/forget-password" class="ml-auto inline-block text-sm underline">
                                Forgot your password?
                            </a>
                        </div>
                        <Input id="password" type="password" placeholder="password" v-model="password" required />
                    </div>
                    <Button type="submit" class="w-full" @click="handleSignIn">
                        Login
                    </Button>
                    <Button variant="outline" class="w-full" @click="async () => {
                        await signIn.social({
                            provider: 'google',
                            callbackURL: '/'
                        })
                    }">
                        Login with Google
                    </Button>
                </div>
                <div class="mt-4 text-center text-sm">
                    Don't have an account?
                    <a href="/sign-up" class="underline">
                        Sign up
                    </a>
                </div>
            </CardContent>
        </Card>
    </div>
</template>