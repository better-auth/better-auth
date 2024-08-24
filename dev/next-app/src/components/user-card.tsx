"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "./ui/button";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function UserCard({
    user,
}: {
    user: {
        name: string;
        email: string;
        image?: string;
    };
}) {
    const router = useRouter();
    return (
        <Card>
            <CardHeader>
                <CardTitle>User</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-8">
                <div className="flex items-center gap-4">
                    <Avatar className="hidden h-9 w-9 sm:flex">
                        <AvatarImage src={user.image || "#"} alt="Avatar" />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="grid gap-1">
                        <p className="text-sm font-medium leading-none">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                <Button className="gap-2 z-10" variant="secondary">
                    <LogOut size={16} />
                    <span className="text-sm" onClick={async () => {
                        const res = await authClient.signOut()
                        router.refresh()
                    }}>
                        Sign Out
                    </span>
                </Button>
            </CardFooter>
        </Card>
    );
}
