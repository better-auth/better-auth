"use client";

import { authClient } from "@/lib/auth-client";
import { useState } from "react";
import Link from 'next/link'

export default function RegisterClientPage() {
  const [clientName, setClientName] = useState("");
  const [redirectUris, setRedirectUris] = useState("http://localhost:3001/callback");
  const [scopes, setScopes] = useState("openid profile email");
  const [response, setResponse] = useState<ClientResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResponse(null);
    setLoading(true);

    try {
      const data = await authClient.oauth2.register({
        client_name: clientName,
        redirect_uris: redirectUris.split("\n").filter(Boolean),
        scope: scopes,
      });

      console.log("Registration response:", data);
      setResponse(data);
    } catch (err: unknown) {
      console.error("Registration error:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to register client";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black p-4">
      <div className="w-full max-w-2xl space-y-8 rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-900">
        <div>
          <h2 className="text-center text-3xl font-bold text-zinc-900 dark:text-white">
            Register OAuth Client
          </h2>
          <p className="mt-2 text-center text-sm text-zinc-600 dark:text-zinc-400">
            Create a new OAuth 2.0 / OIDC client application
          </p>
        </div>

        {!response ? (
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="clientName"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Client Name
                </label>
                <input
                  id="clientName"
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  placeholder="My Application"
                />
              </div>

              <div>
                <label
                  htmlFor="redirectUris"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Redirect URIs (one per line)
                </label>
                <textarea
                  id="redirectUris"
                  required
                  value={redirectUris}
                  onChange={(e) => setRedirectUris(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  placeholder="http://localhost:3001/callback"
                />
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                  Enter each redirect URI on a new line
                </p>
              </div>

              <div>
                <label
                  htmlFor="scopes"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Scopes
                </label>
                <input
                  id="scopes"
                  type="text"
                  required
                  value={scopes}
                  onChange={(e) => setScopes(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  placeholder="openid profile email"
                />
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                  Space-separated list of scopes
                </p>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3 dark:bg-red-900/20">
                <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
                <p className="mt-2 text-xs text-red-600 dark:text-red-500">
                  Check the browser console for more details.
                </p>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {loading ? "Registering..." : "Register Client"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="rounded-md bg-green-50 p-4 dark:bg-green-900/20">
              <p className="text-sm font-medium text-green-800 dark:text-green-400">
                Client registered successfully!
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Client ID
                </label>
                <div className="mt-1 flex">
                  <input
                    type="text"
                    readOnly
                    value={response.client_id || "N/A"}
                    className="flex-1 rounded-l-md border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                  <button
                    onClick={() => response.client_id && navigator.clipboard.writeText(response.client_id)}
                    disabled={!response.client_id}
                    className="rounded-r-md border border-l-0 border-zinc-300 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {response.client_secret ? (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Client Secret
                  </label>
                  <div className="mt-1 flex">
                    <input
                      type="text"
                      readOnly
                      value={response.client_secret}
                      className="flex-1 rounded-l-md border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(response.client_secret)}
                      className="rounded-r-md border border-l-0 border-zinc-300 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    Save this secret securely. You won&#39;t be able to see it again.
                  </p>
                </div>
              ) : (
                <div className="rounded-md bg-yellow-50 p-3 dark:bg-yellow-900/20">
                  <p className="text-sm text-yellow-800 dark:text-yellow-400">
                    No client secret was returned. This might be a public client.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-700">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-white">
                Test Your Integration
              </h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Use these endpoints to integrate with your application:
              </p>
              <div className="mt-3 space-y-2 text-xs">
                <div className="font-mono text-zinc-600 dark:text-zinc-400">
                  <span className="text-zinc-900 dark:text-white">Authorization URL:</span>
                  <br />
                  {`${window.location.origin}/api/auth/oauth2/authorize`}
                </div>
                <div className="font-mono text-zinc-600 dark:text-zinc-400">
                  <span className="text-zinc-900 dark:text-white">Token URL:</span>
                  <br />
                  {`${window.location.origin}/api/auth/oauth2/token`}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setResponse(null);
                setClientName("");
                setRedirectUris("http://localhost:3001/callback");
                setScopes("openid profile email");
              }}
              className="w-full rounded-md border border-zinc-300 px-4 py-2 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Register Another Client
            </button>
          </div>
        )}

        <div className="text-center">
          <Link
            href="/"
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
