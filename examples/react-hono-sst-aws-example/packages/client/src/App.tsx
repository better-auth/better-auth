import { useState } from 'react';
import './App.css'
import { Button } from './components/ui/button';
import { authClient } from './lib/auth-client'
import Spinner from './components/Spinner';

function App() {
  const { data: session, isPending, error } = authClient.useSession()
  const [isSigningOut, setIsSigningOut] = useState(false);
  const handleSignIn = async () => {
    console.log('signing in');
    await authClient.signIn.social({ provider: "google" })
  }

  const handleSignOut = async () => {
    console.log('signing out', session);
    // clear server session
    // clear all cookies
    setIsSigningOut(true);
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = '/'
        },
      },
    });
  }
  if (isPending || session === null) {
    return (
      <div className="flex justify-center items-center h-screen">
        {isPending ? (
          <Spinner />
        ) : (
          <Button onClick={handleSignIn}>Sign In</Button>
        )}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p>{error.message}</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col items-center gap-y-4 mt-4  max-w-2xl mx-auto">
        <div className="flex flex-row items-center gap-x-4 justify-between">
          <img src={session?.user?.image} alt="user avatar" className="w-16 h-16 rounded-full" />
          <h2 className="text-2xl font-bold">{session?.user?.name}</h2>
        </div>
        <pre className="text-sm whitespace-pre-wrap bg-gray-100 p-4 rounded-md max-w-2xl
overflow-x-auto
mt-4
        ">{JSON.stringify(session, null, 2)}</pre>
        <Button className={`mx-auto max-w-xl ${isSigningOut ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={() => handleSignOut()}>
          {isSigningOut ? 'Signing out...' : 'Sign Out'}
        </Button>
      </div>
    </>
  )
}

export default App
