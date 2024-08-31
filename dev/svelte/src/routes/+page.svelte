<script lang="ts">
  import { client } from "$lib/client";

  const session = client.$session;
</script>

<div
  style="display: flex; min-height: 100vh; align-items: center; justify-content: center;"
>
  <div
    style="display: flex; flex-direction: column; gap: 10px; border-radius: 10px; border: 1px solid #4B453F; padding: 20px; margin-top: 10px;"
  >
    <div>
      {#if $session}
        <div>
          <p>
            {$session?.user.name}
          </p>
          <p>
            {$session?.user.email}
          </p>
          <button
            on:click={async () => {
              await client.signOut();
            }}
          >
            Signout
          </button>
        </div>
      {:else}
        <button
          on:click={async () => {
            await client.signIn.social({
              provider: "github",
            });
          }}
        >
          Continue with github
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  :root {
    font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
    line-height: 1.5;
    font-weight: 400;

    color-scheme: light dark;
    color: rgba(255, 255, 255, 0.87);
    background-color: #242424;

    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  button {
    border-radius: 8px;
    border: 1px solid transparent;
    padding: 0.6em 1.2em;
    font-size: 1em;
    font-weight: 500;
    font-family: inherit;
    background-color: #1a1a1a;
    cursor: pointer;
    transition: border-color 0.25s;
  }
  button:hover {
    border-color: #646cff;
  }
  button:focus,
  button:focus-visible {
    outline: 4px auto -webkit-focus-ring-color;
  }
</style>
