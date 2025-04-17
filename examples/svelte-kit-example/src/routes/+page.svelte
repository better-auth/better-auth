<script>
import { client } from "$lib/auth-client";
const features = [
	"social sign-in",
	"email and password",
	"two-factor",
	"password-rest",
	"email-verification",
];

const session = client.useSession();
$: to = $session.data ? "/dashboard" : "/sign-in";
</script>

<div
  class="min-h-[80vh] flex items-center justify-center overflow-hidden no-visible-scrollbar px-6 md:px-0"
>
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
          <div
            class="text-xs flex items-center gap-2 justify-center text-muted-foreground"
          >
            <span class="text-center">
              All features on this demo are Implemented with Better Auth without
              any custom backend code
            </span>
          </div>
        </div>
        <div class="flex gap-2 justify-center flex-wrap">
          {#each features as feature}
            <span
              class="border-b pb-1 text-muted-foreground text-xs cursor-pointer hover:text-foreground duration-150 ease-in-out transition-all hover:border-foreground flex items-center gap-1"
              >{feature}</span
            >
          {/each}
        </div>
      </div>

      <div class="flex items-center gap-2 mt-2 mx-auto">
        <a href={to} class="">
          <Button class="rounded-none gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="1.2em"
              height="1.2em"
              viewBox="0 0 24 24"
              ><path
                fill="currentColor"
                d="M5 3H3v4h2V5h14v14H5v-2H3v4h18V3zm12 8h-2V9h-2V7h-2v2h2v2H3v2h10v2h-2v2h2v-2h2v-2h2z"
              ></path></svg
            >
            {#if $session.data}
              Dashboard
            {:else}
              Sign In
            {/if}
          </Button>
        </a>
        {#if $session.data}
          <Button
            class="rounded-none"
            on:click={async () => {
              await client.signOut();
            }}
            variant="outline">Sign Out</Button
          >
        {/if}
      </div>
    </div>
  </main>
</div>
