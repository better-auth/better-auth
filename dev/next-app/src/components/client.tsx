"use client";

import { authClient } from "@/lib/client";
import { useAuthStore } from "better-auth/react"
import { Button } from "./ui/button";
export function Client() {
    const session = useAuthStore(authClient.$session)
    type S = NonNullable<typeof session>
    const a: S['user'] = {
        id: "1",
        name: "test",
        email: "test@test.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    }
    return (
        <div>
            {
                session ? <div>
                    <Button onClick={async () => {
                        if (session.user.twoFactorEnabled) {
                            await authClient.disableTotp()
                        } else {
                            await authClient.enableTotp()
                        }
                    }}>
                        {
                            session.user.twoFactorEnabled ? "Disable" : "Enable"
                        }
                    </Button>
                </div> : null
            }
        </div>
    )
}