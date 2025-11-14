"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function ConsentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clientName, setClientName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get consent details from URL parameters
    const client = searchParams.get("client_name") || "Unknown Application";
    const scopesParam = searchParams.get("scopes") || "";
    const scopeList = scopesParam.split(" ").filter(Boolean);

    setClientName(client);
    setScopes(scopeList);
    setLoading(false);
  }, [searchParams]);

  const handleConsent = async (granted: boolean) => {
    try {
      const state = searchParams.get("state");
      const clientId = searchParams.get("client_id");

      await authClient.oidc.grantConsent({
        consent: granted,
        state: state || "",
        clientId: clientId || "",
      });

      // Redirect back to the authorization flow
      const redirectUrl = searchParams.get("redirect_uri");
      if (redirectUrl) {
        router.push(redirectUrl);
      }
    } catch (err) {
      console.error("Consent error:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-zinc-600 dark:text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-900">
        <div>
          <h2 className="text-center text-3xl font-bold text-zinc-900 dark:text-white">
            Authorization Request
          </h2>
          <p className="mt-2 text-center text-sm text-zinc-600 dark:text-zinc-400">
            {clientName} is requesting access to your account
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <div>
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              This application will be able to:
            </h3>
            <ul className="mt-2 space-y-2">
              {scopes.map((scope) => (
                <li
                  key={scope}
                  className="flex items-start text-sm text-zinc-600 dark:text-zinc-400"
                >
                  <svg
                    className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-500"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    {scope === "profile"
                      ? "Access your profile information"
                      : scope === "email"
                        ? "Access your email address"
                        : scope === "openid"
                          ? "Verify your identity"
                          : `Access ${scope}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 flex gap-4">
            <button
              onClick={() => handleConsent(false)}
              className="w-full rounded-md border border-zinc-300 px-4 py-2 font-medium text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Deny
            </button>
            <button
              onClick={() => handleConsent(true)}
              className="w-full rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Allow
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-500">
          By allowing access, you authorize this application to use your
          information in accordance with their terms of service and privacy
          policy.
        </p>
      </div>
    </div>
  );
}
