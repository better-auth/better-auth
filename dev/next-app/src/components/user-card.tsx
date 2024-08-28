"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "./ui/button";
import { Check, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import AddPasskey from "./add-passkey";
import { Session, User } from "@/lib/types";
import { toast } from "sonner";

export default function UserCard(props: {
    session: {
        user: User;
        session: Session
    } | null
}) {
    const router = useRouter();
    const session = authClient.useSession(props.session)
    return (
        <Card>
            <CardHeader>
                <CardTitle>User</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-8">
                <div className="flex items-center gap-4">
                    <Avatar className="hidden h-9 w-9 sm:flex">
                        <AvatarImage src={session?.user.image || "#"} alt="Avatar" />
                        <AvatarFallback>{session?.user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="grid gap-1">
                        <p className="text-sm font-medium leading-none">{session?.user.name}</p>
                        <p className="text-sm text-muted-foreground">{session?.user.email}</p>
                    </div>
                </div>
                <div className="border-y py-4 flex items-center justify-between gap-2">
                    <AddPasskey />
                    {
                        session?.user.twoFactorEnabled ? <Button variant="secondary" className="gap-2" onClick={async () => {
                            const res = await authClient.twoFactor.disable()
                            if (res.error) {
                                toast.error(res.error.message)
                            }
                        }}>
                            Disable 2FA
                        </Button> : <Button variant="outline" className="gap-2" onClick={async () => {
                            const res = await authClient.twoFactor.enable()
                            if (res.error) {
                                toast.error(res.error.message)
                            }
                        }}>
                            <p>
                                Enable 2FA
                            </p>
                        </Button>
                    }
                </div>
            </CardContent>
            <CardFooter>
                <Button className="gap-2 z-10" variant="secondary">
                    <LogOut size={16} />
                    <span className="text-sm" onClick={async () => {
                        await authClient.signOut()
                        router.refresh()
                    }}>
                        Sign Out
                    </span>
                </Button>
            </CardFooter>
        </Card>
    );
}
