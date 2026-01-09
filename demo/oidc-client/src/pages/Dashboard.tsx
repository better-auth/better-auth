import { Key, LogOut, Shield, User } from "lucide-react";
import { useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/lib/auth/useAuth";

export function Dashboard() {
	const { user, logout, isAuthenticated, isLoading, accessToken } = useAuth();
	const [, setLocation] = useLocation();

	// Show loading state while checking authentication
	if (isLoading) {
		return (
			<div className="w-full max-w-4xl mx-auto px-4 py-8">
				<div className="flex items-center justify-center h-64">
					<div className="text-center">
						<div className="text-muted-foreground">Loading...</div>
					</div>
				</div>
			</div>
		);
	}

	// Redirect to home if not authenticated after loading
	if (!isAuthenticated || !user) {
		setLocation("/");
		return null;
	}

	const getUserInitials = () => {
		const name = (user.name as string) || (user.email as string) || "U";
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);
	};

	return (
		<div className="w-full max-w-4xl mx-auto px-4 py-8">
			<div className="flex flex-col gap-6">
				{/* Header */}
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-bold">Dashboard</h1>
						<p className="text-muted-foreground">Welcome back!</p>
					</div>
					<Button onClick={() => logout()} variant="outline">
						<LogOut className="w-4 h-4 mr-2" />
						Sign Out
					</Button>
				</div>

				{/* User Profile Card */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<User className="w-5 h-5" />
							User Profile
						</CardTitle>
						<CardDescription>
							Your account information from the OIDC provider
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex items-start gap-4">
							<Avatar className="w-16 h-16">
								<AvatarImage src={user.picture as string} />
								<AvatarFallback>{getUserInitials()}</AvatarFallback>
							</Avatar>
							<div className="flex-1 space-y-3">
								{!!user.name && (
									<div>
										<div className="text-sm font-medium text-muted-foreground">
											Name
										</div>
										<div className="text-base">{String(user.name)}</div>
									</div>
								)}
								{!!user.email && (
									<div>
										<div className="text-sm font-medium text-muted-foreground">
											Email
										</div>
										<div className="text-base">{String(user.email)}</div>
									</div>
								)}
								{!!user.sub && (
									<div>
										<div className="text-sm font-medium text-muted-foreground">
											Subject (sub)
										</div>
										<div className="text-base font-mono text-sm">
											{String(user.sub)}
										</div>
									</div>
								)}
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Session Info Card */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Shield className="w-5 h-5" />
							Session Information
						</CardTitle>
						<CardDescription>Your current OIDC session details</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<div>
							<div className="text-sm font-medium text-muted-foreground mb-1">
								Access Token
							</div>
							<div className="text-xs font-mono bg-muted p-3 rounded-md break-all">
								{accessToken
									? `${accessToken.slice(0, 50)}...`
									: "Not available"}
							</div>
						</div>
						<div>
							<div className="text-sm font-medium text-muted-foreground mb-1">
								Status
							</div>
							<div className="flex items-center gap-2">
								<div className="w-2 h-2 rounded-full bg-green-500" />
								<span className="text-sm">Authenticated</span>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* All User Claims Card */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Key className="w-5 h-5" />
							All Claims
						</CardTitle>
						<CardDescription>
							Complete user information returned by the UserInfo endpoint
						</CardDescription>
					</CardHeader>
					<CardContent>
						<pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-x-auto">
							{JSON.stringify(user, null, 2)}
						</pre>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
