import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { User } from "@prisma/client";

export default function UserCard({ user }: { user: Omit<User, "password"> }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>User</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-8">
				<div className="flex items-center gap-4">
					<Avatar className="hidden h-9 w-9 sm:flex">
						<AvatarImage src={user.image || "#"} alt="Avatar" />
						<AvatarFallback>OM</AvatarFallback>
					</Avatar>
					<div className="grid gap-1">
						<p className="text-sm font-medium leading-none">
							{user.firstName} {user.lastName}
						</p>
						<p className="text-sm text-muted-foreground">{user.email}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
