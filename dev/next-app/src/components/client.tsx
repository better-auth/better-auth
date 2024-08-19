"use client";

import { authClient } from "@/lib/client";
import { useAuthStore } from "better-auth/react"
export function Client() {
    const session = useAuthStore(authClient.$session)
    return (
        <div>
            {JSON.stringify(session)}
        </div>
    )
}