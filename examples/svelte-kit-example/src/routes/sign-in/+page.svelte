<script lang="ts">
import { signIn } from "$lib/auth-client";
import { writable } from "svelte/store";

const email = writable("");
const password = writable("");

const handleSignIn = async () => {
	await signIn.email(
		{
			email: $email,
			password: $password,
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

<Card.Root class="mx-auto max-w-sm">
  <Card.Header>
    <Card.Title class="text-2xl">Login</Card.Title>
    <Card.Description>
      Enter your email below to login to your account
    </Card.Description>
  </Card.Header>
  <Card.Content>
    <div class="grid gap-4">
      <div class="grid gap-2">
        <Label for="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="m@example.com"
          required
          bind:value={$email}
        />
      </div>
      <div class="grid gap-2">
        <div class="flex items-center">
          <Label for="password">Password</Label>
          <a
            href="/forget-password"
            class="ml-auto inline-block text-sm underline"
          >
            Forgot your password?
          </a>
        </div>
        <Input id="password" type="password" required bind:value={$password} />
      </div>
      <Button type="button" class="w-full" on:click={handleSignIn}>Login</Button
      >
      <Button
        variant="outline"
        class="w-full"
        on:click={async () => {
          await signIn.social({
            provider: "google",
            callbackURL: "/",
          });
        }}>Login with Google</Button
      >
    </div>
    <div class="mt-4 text-center text-sm">
      Don&apos;t have an account?
      <a href="/sign-up" class="underline">Sign up</a>
    </div>
  </Card.Content>
</Card.Root>




   
  