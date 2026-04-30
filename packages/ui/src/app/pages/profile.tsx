import { useEffect, useState } from "react";
import { authClient } from "@/app/api";
import {
	Alert,
	AlertDescription,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Input,
	Label,
	Separator,
} from "@/components";
import { useConfig } from "@/config";

interface User {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string;
	createdAt: string;
}

export function ProfilePage() {
	const config = useConfig();
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [updating, setUpdating] = useState(false);

	useEffect(() => {
		fetchSession()
			.then()
			.catch((err) => {
				throw err;
			});
	}, []);

	async function fetchSession() {
		const { data, error } = await authClient.getSession();

		if (error || !data) {
			window.location.href = config.paths.signIn;
			return;
		}

		setUser(data.user);
		setLoading(false);
	}

	async function handleUpdateProfile(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);
		setSuccess(null);
		setUpdating(true);

		const formData = new FormData(e.currentTarget);
		const name = formData.get("name") as string;
		const image = formData.get("image") as string;

		const { error } = await authClient.updateUser({
			name,
			image: image || undefined,
		});

		if (error) {
			setError(error.message);
			setUpdating(false);
			return;
		}

		setUser((prev) =>
			prev ? { ...prev, name, image: image || prev.image } : null,
		);
		setSuccess("Profile updated successfully");
		setUpdating(false);
	}

	async function handleChangePassword(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);
		setSuccess(null);
		setUpdating(true);

		const formData = new FormData(e.currentTarget);
		const currentPassword = formData.get("currentPassword") as string;
		const newPassword = formData.get("newPassword") as string;
		const confirmPassword = formData.get("confirmPassword") as string;

		if (newPassword !== confirmPassword) {
			setError("Passwords do not match");
			setUpdating(false);
			return;
		}

		if (newPassword.length < config.minPasswordLength) {
			setError(
				`Password must be at least ${config.minPasswordLength} characters`,
			);
			setUpdating(false);
			return;
		}

		const { error } = await authClient.changePassword({
			currentPassword,
			newPassword,
		});

		if (error) {
			setError(error.message);
			setUpdating(false);
			return;
		}

		setSuccess("Password changed successfully");
		(e.target as HTMLFormElement).reset();
		setUpdating(false);
	}

	async function handleSignOut() {
		const { error } = await authClient.signOut();

		if (error) {
			setError("Failed to sign out");
			return;
		}

		window.location.href = config.paths.signIn;
	}

	async function handleAddPasskey() {
		setError(null);
		setSuccess(null);

		const { error } = await authClient.passkey.addPasskey();

		if (error) {
			setError(error.message);
			return;
		}

		setSuccess("Passkey added successfully");
	}

	if (loading) {
		return (
			<div className="w-full max-w-2xl mx-auto flex items-center justify-center py-12">
				<div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
			</div>
		);
	}

	if (!user) {
		return null;
	}

	return (
		<div className="w-full max-w-2xl mx-auto space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Profile</CardTitle>
					<CardDescription>
						Manage your account settings and preferences.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
					{success && (
						<Alert>
							<AlertDescription>{success}</AlertDescription>
						</Alert>
					)}

					<form onSubmit={handleUpdateProfile} className="space-y-4">
						<div className="flex items-center gap-4">
							{user.image ? (
								<img
									src={user.image}
									alt={user.name}
									className="h-16 w-16 rounded-full object-cover"
								/>
							) : (
								<div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
									<span className="text-xl font-medium text-muted-foreground">
										{user.name.charAt(0).toUpperCase()}
									</span>
								</div>
							)}
							<div className="flex-1">
								<p className="font-medium">{user.name}</p>
								<p className="text-sm text-muted-foreground">{user.email}</p>
							</div>
						</div>

						<Separator />

						<div className="grid gap-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								name="name"
								defaultValue={user.name}
								disabled={updating}
							/>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="image">Avatar URL</Label>
							<Input
								id="image"
								name="image"
								type="url"
								placeholder="https://example.com/avatar.jpg"
								defaultValue={user.image || ""}
								disabled={updating}
							/>
						</div>

						<div className="grid gap-2">
							<Label>Email</Label>
							<Input value={user.email} disabled />
							<p className="text-xs text-muted-foreground">
								{user.emailVerified ? "✓ Verified" : "Not verified"}
							</p>
						</div>

						<Button type="submit" disabled={updating}>
							{updating ? "Saving..." : "Save Changes"}
						</Button>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Change Password</CardTitle>
					<CardDescription>
						Update your password to keep your account secure.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleChangePassword} className="space-y-4">
						<div className="grid gap-2">
							<Label htmlFor="currentPassword">Current Password</Label>
							<Input
								id="currentPassword"
								name="currentPassword"
								type="password"
								required
								disabled={updating}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="newPassword">New Password</Label>
							<Input
								id="newPassword"
								name="newPassword"
								type="password"
								required
								minLength={config.minPasswordLength}
								disabled={updating}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="confirmPassword">Confirm New Password</Label>
							<Input
								id="confirmPassword"
								name="confirmPassword"
								type="password"
								required
								disabled={updating}
							/>
						</div>
						<Button type="submit" disabled={updating}>
							{updating ? "Updating..." : "Change Password"}
						</Button>
					</form>
				</CardContent>
			</Card>

			{config.features.passkey && (
				<Card>
					<CardHeader>
						<CardTitle>Passkeys</CardTitle>
						<CardDescription>
							Manage your passkeys for passwordless authentication.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button variant="outline" onClick={handleAddPasskey}>
							<svg
								className="size-4 mr-2"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<circle cx="12" cy="10" r="3" />
								<path d="M12 2a8 8 0 0 0-8 8c0 1.892.402 3.13 1.5 4.5L12 22l6.5-7.5c1.098-1.37 1.5-2.608 1.5-4.5a8 8 0 0 0-8-8z" />
							</svg>
							Add Passkey
						</Button>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Danger Zone</CardTitle>
					<CardDescription>Sign out of your account.</CardDescription>
				</CardHeader>
				<CardContent>
					<Button variant="destructive" onClick={handleSignOut}>
						Sign Out
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
