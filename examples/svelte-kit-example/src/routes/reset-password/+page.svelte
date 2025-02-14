<script>
import { writable } from "svelte/store";

const confirmPassword = writable("");
const password = writable("");
</script>

<Card.Root class="mx-auto ">
  <Card.Header>
    <Card.Title class="text-2xl">Reset Password</Card.Title>
    <Card.Description>Enter your new password below</Card.Description>
  </Card.Header>
  <Card.Content>
    <div class="grid gap-4">
      <div class="grid gap-2">
        <Label for="password">New Password</Label>
        <Input
          id="password"
          type="password"
          required
          bind:value={$password}
          placeholder="New Password"
        />
      </div>
      <div class="grid gap-2">
        <Label for="password">Confirm Password</Label>
        <Input
          id="password"
          type="password"
          required
          placeholder="Confirm Password"
          bind:value={$confirmPassword}
        />
      </div>
      <Button
        type="button"
        class="w-full"
        on:click={async () => {
          await client.resetPassword({
            newPassword: $password,
            fetchOptions: {
              onSuccess(context) {
                window.location.href = "/sign-in";
              },
              onError(context) {
                alert(context.error.message);
              },
            },
          });
        }}>Reset</Button
      >
    </div>
  </Card.Content>
</Card.Root>
