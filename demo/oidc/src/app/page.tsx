"use client"
import Link from "next/link";
import { authClient } from '@/lib/auth-client'

export default function Home() {
  const { data: session } = authClient.useSession()

  const handleSignOut = async () => {
    await authClient.signOut()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="w-full">
          <h1 className="text-4xl font-bold text-black dark:text-white">
            Better Auth OIDC Provider
          </h1>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            OpenID Connect Provider implementation using better-auth
          </p>
        </div>

        <div className="w-full space-y-6">
          {session?.user && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-950">
              <h2 className="text-xl font-semibold text-black dark:text-white">
                Welcome back, {session.user.name || session.user.email}!
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                You are currently signed in.
              </p>
              <div className="mt-4 space-y-2">
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="font-medium">Email:</span> {session.user.email}
                </div>
                {session.user.name && (
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium">Name:</span> {session.user.name}
                  </div>
                )}
                <button
                  onClick={handleSignOut}
                  className="mt-2 rounded-md border border-red-300 px-4 py-2 font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
            <h2 className="text-xl font-semibold text-black dark:text-white">
              Getting Started
            </h2>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              This demo implements an OIDC provider with better-auth. You can
              sign up, sign in, and authorize OAuth clients.
            </p>

            <div className="mt-4 space-y-2">
              {!session?.user ? (
                <Link
                  href="/sign-in"
                  className="block rounded-md bg-zinc-900 px-4 py-2 text-center font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Sign In / Sign Up
                </Link>
              ) : (
                <Link
                  href="/dashboard"
                  className="block rounded-md bg-zinc-900 px-4 py-2 text-center font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Go to Dashboard
                </Link>
              )}
              <Link
                href="/register-client"
                className="block rounded-md border border-zinc-300 px-4 py-2 text-center font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Register OAuth Client
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
            <h2 className="text-xl font-semibold text-black dark:text-white">
              OIDC Endpoints
            </h2>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="font-mono text-zinc-600 dark:text-zinc-400">
                <span className="text-zinc-900 dark:text-white">
                  Authorization:
                </span>{" "}
                /api/auth/oauth2/authorize
              </li>
              <li className="font-mono text-zinc-600 dark:text-zinc-400">
                <span className="text-zinc-900 dark:text-white">Token:</span>{" "}
                /api/auth/oauth2/token
              </li>
              <li className="font-mono text-zinc-600 dark:text-zinc-400">
                <span className="text-zinc-900 dark:text-white">
                  UserInfo:
                </span>{" "}
                /api/auth/oauth2/userinfo
              </li>
              <li className="font-mono text-zinc-600 dark:text-zinc-400">
                <span className="text-zinc-900 dark:text-white">
                  Discovery:
                </span>{" "}
                /api/auth/.well-known/openid-configuration
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
            <h2 className="text-xl font-semibold text-black dark:text-white">
              Features
            </h2>
            <ul className="mt-4 space-y-2">
              <li className="flex items-start text-zinc-600 dark:text-zinc-400">
                <svg
                  className="mr-2 mt-1 h-4 w-4 flex-shrink-0 text-green-500"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
                Email and password authentication
              </li>
              <li className="flex items-start text-zinc-600 dark:text-zinc-400">
                <svg
                  className="mr-2 mt-1 h-4 w-4 flex-shrink-0 text-green-500"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
                OAuth 2.0 Authorization Code flow
              </li>
              <li className="flex items-start text-zinc-600 dark:text-zinc-400">
                <svg
                  className="mr-2 mt-1 h-4 w-4 flex-shrink-0 text-green-500"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
                OpenID Connect support
              </li>
              <li className="flex items-start text-zinc-600 dark:text-zinc-400">
                <svg
                  className="mr-2 mt-1 h-4 w-4 flex-shrink-0 text-green-500"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
                Dynamic client registration
              </li>
              <li className="flex items-start text-zinc-600 dark:text-zinc-400">
                <svg
                  className="mr-2 mt-1 h-4 w-4 flex-shrink-0 text-green-500"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
                User consent management
              </li>
            </ul>
          </div>
        </div>

        <div className="w-full text-center text-sm text-zinc-500 dark:text-zinc-500">
          Powered by{" "}
          <a
            href="https://better-auth.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-zinc-900 dark:text-zinc-100"
          >
            better-auth
          </a>
        </div>
      </main>
    </div>
  );
}
