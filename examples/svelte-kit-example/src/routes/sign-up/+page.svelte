<script lang="ts">
import { signUp } from "$lib/auth-client";
import { writable } from "svelte/store";

// Create writable stores for form fields
const firstName = writable("");
const lastName = writable("");
const email = writable("");
const password = writable("");

// Function to handle form submission
const handleSignUp = async () => {
	const user = {
		firstName: $firstName,
		lastName: $lastName,
		email: $email,
		password: $password,
	};
	await signUp.email({
		email: user.email,
		password: user.password,
		name: `${user.firstName} ${user.lastName}`,
		callbackURL: "/",
		fetchOptions: {
			onError(context) {
				alert(context.error.message);
			},
		},
	});
};
</script>

<Card.Root class="mx-auto max-w-sm">
  <Card.Header>
    <Card.Title class="text-xl">Sign Up</Card.Title>
    <Card.Description>
      Enter your information to create an account
    </Card.Description>
  </Card.Header>
  <Card.Content>
    <div class="grid gap-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label for="first-name">First name</Label>
          <Input
            id="first-name"
            placeholder="Max"
            required
            bind:value={$firstName}
          />
        </div>
        <div class="grid gap-2">
          <Label for="last-name">Last name</Label>
          <Input
            id="last-name"
            placeholder="Robinson"
            required
            bind:value={$lastName}
          />
        </div>
      </div>
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
        <Label for="password">Password</Label>
        <Input id="password" type="password" bind:value={$password} />
      </div>
      <Button type="button" class="w-full" on:click={handleSignUp}
        >Create an account</Button
      >
      <Button variant="outline" class="w-full">Sign up with GitHub</Button>
    </div>
    <div class="mt-4 text-center text-sm">
      Already have an account?
      <a href="/sign-in" class="underline"> Sign in </a>
    </div>
  </Card.Content>
</Card.Root>
