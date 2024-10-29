import { createFileRoute } from '@tanstack/react-router'
import { signIn, signOut, useSession } from '~/lib/client/auth';

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const { data } = useSession();

  return (
    <div>
      {data?.user && (
        <div>
          <p>Name: {data.user.name}</p>
          <p>Email: {data.user.email}</p>
          <p>Session ID: {data.session.id}</p>
          <button type="button" onClick={() => signOut()}>
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}