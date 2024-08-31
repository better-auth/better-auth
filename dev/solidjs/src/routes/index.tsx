import { client } from "~/lib/client";


export default function Home() {
  const session = client.useSession()
  return (
    <main class="text-center mx-auto text-gray-700 p-4 min-h-screen flex flex-col items-center justify-center">
      {
        session() ? <div class="flex flex-col gap-2 border border-blue-400/10 px-6 py-5">
          <p class="text-2xl text-white">
            {session()?.user.name}
          </p>
          <p>
            {session()?.user.email}
          </p>
          <button class="bg-sky-600 text-white px-4 py-2 rounded-md" onclick={async () => {
            await client.signOut()
          }}>
            Signout
          </button>
        </div> : <button class="bg-sky-600 text-white px-4 py-2 rounded-md" onclick={async () => {
          await client.signIn.social({
            provider: "github",
          })
        }}>
          Continue with github
        </button>
      }
    </main>
  );
}
