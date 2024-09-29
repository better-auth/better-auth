<script lang="ts" setup>
import { forgetPassword } from "~/lib/auth-client.js";

const email = ref("");

const handleForgetPassword = async () => {
	if (!email.value) {
		alert("Please enter your email address");
		return;
	}
	await forgetPassword(
		{
			email: email.value,
			redirectTo: "/reset-password",
		},
		{
			// onSuccess find the url with token in server console. For detail check forgetPassword section: https://www.better-auth.com/docs/authentication/email-password
			onSuccess() {
				alert("Password reset link sent to your email");
				window.location.href = "/sign-in";
			},
			onError(context) {
				alert(context.error.message);
			},
		},
	);
};
</script>


<template>
	<div class="h-screen flex justify-center items-center">
		<CardRoot class="mx-auto max-w-sm">
			<CardHeader>
				<CardTitle class="text-2xl">Reset Password</CardTitle>
				<CardDescription>
					Enter your email below to reset your password
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid gap-4">
					<div class="grid gap-2">
						<Label for="email">Email</Label>
						<Input id="email" type="email" placeholder="m@example.com" required v-model="email" />
					</div>
					<Button type="button" class="w-full" @click="handleForgetPassword">
						Reset Password
					</Button>
				</div>
				<div class="mt-4 text-center text-sm">
					<a href="/sign-in" class="underline">Back to Sign In </a>
				</div>
			</CardContent>
		</CardRoot>
	</div>
</template>