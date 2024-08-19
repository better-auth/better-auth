"use client";

import { authClient } from "@/lib/client";

export function Client() {
    const session = authClient.useSession()
    return (
        <div>
            {JSON.stringify(session)}
        </div>
    )
}