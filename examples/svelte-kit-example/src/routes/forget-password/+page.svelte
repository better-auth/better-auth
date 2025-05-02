<script lang="ts">
	import * as Card from '$lib/components/ui/card/index';
	import Label from '$lib/components/ui/label/label.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { client } from '$lib/auth-client';

	let email = '';
</script>

<Card.Root class="mx-auto max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl">Reset Password</Card.Title>
		<Card.Description>Enter your email below to reset your password</Card.Description>
	</Card.Header>
	<Card.Content>
		<div class="grid gap-4">
			<div class="grid gap-2">
				<Label for="email">Email</Label>
				<Input id="email" type="email" placeholder="m@example.com" required bind:value={email} />
			</div>
			<Button
				type="button"
				class="w-full"
				on:click={async () => {
					if (!email) {
						alert('Please enter your email address');
						return;
					}
					await client.forgetPassword(
						{
							email: email,
							redirectTo: '/reset-password',
						},
						{
							onSuccess() {
								alert('Password reset link sent to your email');
								window.location.href = '/sign-in';
							},
							onError(context) {
								alert(context.error.message);
							},
						},
					);
				}}
			>
				Reset Password
			</Button>
		</div>
		<div class="mt-4 text-center text-sm">
			<a href="/sign-in" class="underline"> Back to Sign In </a>
		</div>
	</Card.Content>
</Card.Root>
