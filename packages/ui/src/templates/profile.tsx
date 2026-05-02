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
} from "./components";

/**
 * Profile page template with ID-annotated elements for hydration.
 * All interactive elements have predictable IDs starting with "ba-profile-".
 */
export function ProfileTemplate() {
	return (
		<>
			{/* Loading state */}
			<div id="ba-profile-loading-view">
				<div className="w-full min-w-96 mx-auto flex items-center justify-center py-12">
					<div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
				</div>
			</div>

			{/* Main profile view */}
			<div id="ba-profile-main-view" className="hidden">
				<div className="w-full min-w-96 mx-auto space-y-6">
					{/* Profile Card */}
					<Card>
						<CardHeader>
							<CardTitle>Profile</CardTitle>
							<CardDescription>
								Manage your account settings and preferences.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div id="ba-profile-error" className="hidden">
								<Alert variant="destructive">
									<AlertDescription id="ba-profile-error-msg" />
								</Alert>
							</div>
							<div id="ba-profile-success" className="hidden">
								<Alert>
									<AlertDescription id="ba-profile-success-msg" />
								</Alert>
							</div>

							<form id="ba-profile-form" className="space-y-4">
								<div className="flex items-center gap-4">
									<div
										id="ba-profile-avatar"
										className="h-16 w-16 rounded-full bg-muted flex items-center justify-center overflow-hidden"
									>
										<span
											id="ba-profile-avatar-initial"
											className="text-xl font-medium text-muted-foreground"
										/>
										<img
											id="ba-profile-avatar-img"
											className="h-full w-full object-cover hidden"
											alt=""
										/>
									</div>
									<div className="flex-1">
										<p id="ba-profile-display-name" className="font-medium" />
										<p
											id="ba-profile-display-email"
											className="text-sm text-muted-foreground"
										/>
									</div>
								</div>

								<Separator />

								<div className="grid gap-2">
									<Label htmlFor="ba-profile-name">Name</Label>
									<Input id="ba-profile-name" name="name" />
								</div>

								<div className="grid gap-2">
									<Label htmlFor="ba-profile-image">Avatar URL</Label>
									<Input
										id="ba-profile-image"
										name="image"
										type="url"
										placeholder="https://example.com/avatar.jpg"
									/>
								</div>

								<div className="grid gap-2">
									<Label>Email</Label>
									<Input id="ba-profile-email" disabled />
									<p
										id="ba-profile-email-status"
										className="text-xs text-muted-foreground"
									/>
								</div>

								<Button id="ba-profile-submit" type="submit">
									Save Changes
								</Button>
							</form>
						</CardContent>
					</Card>

					{/* Change Password Card */}
					<Card>
						<CardHeader>
							<CardTitle>Change Password</CardTitle>
							<CardDescription>
								Update your password to keep your account secure.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form id="ba-profile-password-form" className="space-y-4">
								<div className="grid gap-2">
									<Label htmlFor="ba-profile-current-password">
										Current Password
									</Label>
									<Input
										id="ba-profile-current-password"
										name="currentPassword"
										type="password"
										required
									/>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="ba-profile-new-password">New Password</Label>
									<Input
										id="ba-profile-new-password"
										name="newPassword"
										type="password"
										required
									/>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="ba-profile-confirm-password">
										Confirm New Password
									</Label>
									<Input
										id="ba-profile-confirm-password"
										name="confirmPassword"
										type="password"
										required
									/>
								</div>
								<Button id="ba-profile-password-submit" type="submit">
									Change Password
								</Button>
							</form>
						</CardContent>
					</Card>

					{/* Passkeys Card */}
					<div id="ba-profile-passkey-card" className="hidden">
						<Card>
							<CardHeader>
								<CardTitle>Passkeys</CardTitle>
								<CardDescription>
									Manage your passkeys for passwordless authentication.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Button id="ba-profile-add-passkey" variant="outline">
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
					</div>

					{/* Danger Zone Card */}
					<Card>
						<CardHeader>
							<CardTitle>Danger Zone</CardTitle>
							<CardDescription>Sign out of your account.</CardDescription>
						</CardHeader>
						<CardContent>
							<Button id="ba-profile-signout" variant="destructive">
								Sign Out
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>
		</>
	);
}
