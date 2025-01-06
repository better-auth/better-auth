<script lang="ts">
import { writable } from "svelte/store";

const email = writable("");
</script>

<Card.Root class="mx-auto max-w-sm">
  <Card.Header>
    <Card.Title class="text-2xl">Reset Password</Card.Title>
    <Card.Description>
      Enter your email below to reset your password
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
      <Button
        type="button"
        class="w-full"
        on:click={async () => {
          if (!$email) {
            alert("Please enter your email address");
            return;
          }
          await client.forgetPassword(
            {
              email: $email,
              redirectTo: "/reset-password",
            },
            {
              onSuccess() {
                alert("Password reset link sent to your email");
                window.location.href = "/sign-in";
              },
              onError(context) {
                alert(context.error.message);
              },
            }
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
