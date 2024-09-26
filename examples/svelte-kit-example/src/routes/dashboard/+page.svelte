<script>
import * as Card from "$lib/components/ui/card/index";
import * as Avatar from "$lib/components/ui/avatar/index";
import { client } from "$lib/auth-client";
import Button from "$lib/components/ui/button/button.svelte";

const session = client.useSession();
</script>

<Card.Root class="w-[350px]">
  <Card.Header>
    <Card.Title>User</Card.Title>
    <Card.Description>Welcome to the dashboard</Card.Description>
  </Card.Header>
  <Card.Content>
    <div class="flex items-center gap-2">
      <Avatar.Root>
        <Avatar.Image src={$session.data?.user.image} />
        <Avatar.Fallback>
          {$session.data?.user.name[0]}
        </Avatar.Fallback>
      </Avatar.Root>
      <div class="">
        <h3 class="text-sm">
          {$session.data?.user.name}
        </h3>
        <p class="text-xs text-muted-foreground">
          {$session.data?.user.email}
        </p>
      </div>
    </div>
  </Card.Content>
  <Card.Footer>
    <Button
      variant="outline"
      on:click={() => {
        client.signOut({
          fetchOptions: {
            body: {
              callbackURL: "/",
            },
          },
        });
      }}>Sign Out</Button
    >
  </Card.Footer>
</Card.Root>
