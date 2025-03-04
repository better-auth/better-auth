"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { client, signOut, useSession } from "@/lib/auth-client";
import { Session } from "@/lib/auth-types";
import { MobileIcon } from "@radix-ui/react-icons";
import {
	Edit,
	Fingerprint,
	Laptop,
	Loader2,
	LogOut,
	Plus,
	QrCode,
	ShieldCheck,
	ShieldOff,
	StopCircle,
	Trash,
	X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { UAParser } from "ua-parser-js";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import QRCode from "react-qr-code";
import CopyButton from "@/components/ui/copy-button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { SubscriptionTierLabel } from "@/components/tier-labels";
import { Component } from "./change-plan";
import { Subscription } from "@better-auth/stripe";

export default function UserCard(props: {
	session: Session | null;
	activeSessions: Session["session"][];
	subscription?: Subscription;
}) {
	const router = useRouter();
	const { data, isPending } = useSession();
	const session = data || props.session;
	const [isTerminating, setIsTerminating] = useState<string>();
	const [isPendingTwoFa, setIsPendingTwoFa] = useState<boolean>(false);
	const [twoFaPassword, setTwoFaPassword] = useState<string>("");
	const [twoFactorDialog, setTwoFactorDialog] = useState<boolean>(false);
	const [twoFactorVerifyURI, setTwoFactorVerifyURI] = useState<string>("");
	const [isSignOut, setIsSignOut] = useState<boolean>(false);
	const [emailVerificationPending, setEmailVerificationPending] =
		useState<boolean>(false);
	const { data: subscription } = useQuery({
		queryKey: ["subscriptions"],
		initialData: props.subscription ? props.subscription : null,
		queryFn: async () => {
			const res = await client.subscription.list({
				fetchOptions: {
					throw: true,
				},
			});
			return res.length ? res[0] : null;
		},
	});
	return (
		<Card>
			<CardHeader>
				<CardTitle>User</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-8 grid-cols-1">
				<div className="flex flex-col gap-2">
					<div className="flex items-start justify-between">
						<div className="flex items-center gap-4">
							<Avatar className="hidden h-9 w-9 sm:flex ">
								<AvatarImage
									src={session?.user.image || undefined}
									alt="Avatar"
									className="object-cover"
								/>
								<AvatarFallback>{session?.user.name.charAt(0)}</AvatarFallback>
							</Avatar>
							<div className="grid">
								<div className="flex items-center gap-1">
									<p className="text-sm font-medium leading-none">
										{session?.user.name}
									</p>
									{!!subscription && (
										<Badge
											className="w-min p-px rounded-full"
											variant="outline"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="1.2em"
												height="1.2em"
												viewBox="0 0 24 24"
											>
												<path
													fill="currentColor"
													d="m9.023 21.23l-1.67-2.814l-3.176-.685l.312-3.277L2.346 12L4.49 9.546L4.177 6.27l3.177-.685L9.023 2.77L12 4.027l2.977-1.258l1.67 2.816l3.176.684l-.312 3.277L21.655 12l-2.142 2.454l.311 3.277l-3.177.684l-1.669 2.816L12 19.973zm1.927-6.372L15.908 9.9l-.708-.72l-4.25 4.25l-2.15-2.138l-.708.708z"
												></path>
											</svg>
										</Badge>
									)}
								</div>
								<p className="text-sm">{session?.user.email}</p>
							</div>
						</div>
						<EditUserDialog />
					</div>
					<div className="flex items-center justify-between">
						<div>
							<SubscriptionTierLabel
								tier={subscription?.plan?.toLowerCase() as "starter"}
							/>
						</div>
						<Component
							currentPlan={subscription?.plan?.toLowerCase() as "starter"}
							isTrial={subscription?.status === "trialing"}
						/>
					</div>
				</div>

				{session?.user.emailVerified ? null : (
					<Alert>
						<AlertTitle>Verify Your Email Address</AlertTitle>
						<AlertDescription className="text-muted-foreground">
							Please verify your email address. Check your inbox for the
							verification email. If you haven't received the email, click the
							button below to resend.
						</AlertDescription>
						<Button
							size="sm"
							variant="secondary"
							className="mt-2"
							onClick={async () => {
								await client.sendVerificationEmail(
									{
										email: session?.user.email || "",
									},
									{
										onRequest(context) {
											setEmailVerificationPending(true);
										},
										onError(context) {
											toast.error(context.error.message);
											setEmailVerificationPending(false);
										},
										onSuccess() {
											toast.success("Verification email sent successfully");
											setEmailVerificationPending(false);
										},
									},
								);
							}}
						>
							{emailVerificationPending ? (
								<Loader2 size={15} className="animate-spin" />
							) : (
								"Resend Verification Email"
							)}
						</Button>
					</Alert>
				)}

				<div className="border-l-2 px-2 w-max gap-1 flex flex-col">
					<p className="text-xs font-medium ">Active Sessions</p>
					{props.activeSessions
						.filter((session) => session.userAgent)
						.map((session) => {
							return (
								<div key={session.id}>
									<div className="flex items-center gap-2 text-sm  text-black font-medium dark:text-white">
										{new UAParser(session.userAgent || "").getDevice().type ===
										"mobile" ? (
											<MobileIcon />
										) : (
											<Laptop size={16} />
										)}
										{new UAParser(session.userAgent || "").getOS().name},{" "}
										{new UAParser(session.userAgent || "").getBrowser().name}
										<button
											className="text-red-500 opacity-80  cursor-pointer text-xs border-muted-foreground border-red-600  underline "
											onClick={async () => {
												setIsTerminating(session.id);
												const res = await client.revokeSession({
													token: session.token,
												});

												if (res.error) {
													toast.error(res.error.message);
												} else {
													toast.success("Session terminated successfully");
												}
												router.refresh();
												setIsTerminating(undefined);
											}}
										>
											{isTerminating === session.id ? (
												<Loader2 size={15} className="animate-spin" />
											) : session.id === props.session?.session.id ? (
												"Sign Out"
											) : (
												"Terminate"
											)}
										</button>
									</div>
								</div>
							);
						})}
				</div>
				<div className="border-y py-4 flex items-center flex-wrap justify-between gap-2">
					<div className="flex flex-col gap-2">
						<p className="text-sm">Passkeys</p>
						<div className="flex gap-2 flex-wrap">
							<AddPasskey />
							<ListPasskeys />
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<p className="text-sm">Two Factor</p>
						<div className="flex gap-2">
							{!!session?.user.twoFactorEnabled && (
								<Dialog>
									<DialogTrigger asChild>
										<Button variant="outline" className="gap-2">
											<QrCode size={16} />
											<span className="md:text-sm text-xs">Scan QR Code</span>
										</Button>
									</DialogTrigger>
									<DialogContent className="sm:max-w-[425px] w-11/12">
										<DialogHeader>
											<DialogTitle>Scan QR Code</DialogTitle>
											<DialogDescription>
												Scan the QR code with your TOTP app
											</DialogDescription>
										</DialogHeader>

										{twoFactorVerifyURI ? (
											<>
												<div className="flex items-center justify-center">
													<QRCode value={twoFactorVerifyURI} />
												</div>
												<div className="flex gap-2 items-center justify-center">
													<p className="text-sm text-muted-foreground">
														Copy URI to clipboard
													</p>
													<CopyButton textToCopy={twoFactorVerifyURI} />
												</div>
											</>
										) : (
											<div className="flex flex-col gap-2">
												<PasswordInput
													value={twoFaPassword}
													onChange={(e) => setTwoFaPassword(e.target.value)}
													placeholder="Enter Password"
												/>
												<Button
													onClick={async () => {
														if (twoFaPassword.length < 8) {
															toast.error(
																"Password must be at least 8 characters",
															);
															return;
														}
														await client.twoFactor.getTotpUri(
															{
																password: twoFaPassword,
															},
															{
																onSuccess(context) {
																	setTwoFactorVerifyURI(context.data.totpURI);
																},
															},
														);
														setTwoFaPassword("");
													}}
												>
													Show QR Code
												</Button>
											</div>
										)}
									</DialogContent>
								</Dialog>
							)}
							<Dialog open={twoFactorDialog} onOpenChange={setTwoFactorDialog}>
								<DialogTrigger asChild>
									<Button
										variant={
											session?.user.twoFactorEnabled ? "destructive" : "outline"
										}
										className="gap-2"
									>
										{session?.user.twoFactorEnabled ? (
											<ShieldOff size={16} />
										) : (
											<ShieldCheck size={16} />
										)}
										<span className="md:text-sm text-xs">
											{session?.user.twoFactorEnabled
												? "Disable 2FA"
												: "Enable 2FA"}
										</span>
									</Button>
								</DialogTrigger>
								<DialogContent className="sm:max-w-[425px] w-11/12">
									<DialogHeader>
										<DialogTitle>
											{session?.user.twoFactorEnabled
												? "Disable 2FA"
												: "Enable 2FA"}
										</DialogTitle>
										<DialogDescription>
											{session?.user.twoFactorEnabled
												? "Disable the second factor authentication from your account"
												: "Enable 2FA to secure your account"}
										</DialogDescription>
									</DialogHeader>

									{twoFactorVerifyURI ? (
										<div className="flex flex-col gap-2">
											<div className="flex items-center justify-center">
												<QRCode value={twoFactorVerifyURI} />
											</div>
											<Label htmlFor="password">
												Scan the QR code with your TOTP app
											</Label>
											<Input
												value={twoFaPassword}
												onChange={(e) => setTwoFaPassword(e.target.value)}
												placeholder="Enter OTP"
											/>
										</div>
									) : (
										<div className="flex flex-col gap-2">
											<Label htmlFor="password">Password</Label>
											<PasswordInput
												id="password"
												placeholder="Password"
												value={twoFaPassword}
												onChange={(e) => setTwoFaPassword(e.target.value)}
											/>
										</div>
									)}
									<DialogFooter>
										<Button
											disabled={isPendingTwoFa}
											onClick={async () => {
												if (twoFaPassword.length < 8 && !twoFactorVerifyURI) {
													toast.error("Password must be at least 8 characters");
													return;
												}
												setIsPendingTwoFa(true);
												if (session?.user.twoFactorEnabled) {
													const res = await client.twoFactor.disable({
														//@ts-ignore
														password: twoFaPassword,
														fetchOptions: {
															onError(context) {
																toast.error(context.error.message);
															},
															onSuccess() {
																toast("2FA disabled successfully");
																setTwoFactorDialog(false);
															},
														},
													});
												} else {
													if (twoFactorVerifyURI) {
														await client.twoFactor.verifyTotp({
															code: twoFaPassword,
															fetchOptions: {
																onError(context) {
																	setIsPendingTwoFa(false);
																	setTwoFaPassword("");
																	toast.error(context.error.message);
																},
																onSuccess() {
																	toast("2FA enabled successfully");
																	setTwoFactorVerifyURI("");
																	setIsPendingTwoFa(false);
																	setTwoFaPassword("");
																	setTwoFactorDialog(false);
																},
															},
														});
														return;
													}
													const res = await client.twoFactor.enable({
														password: twoFaPassword,
														fetchOptions: {
															onError(context) {
																toast.error(context.error.message);
															},
															onSuccess(ctx) {
																setTwoFactorVerifyURI(ctx.data.totpURI);
																// toast.success("2FA enabled successfully");
																// setTwoFactorDialog(false);
															},
														},
													});
												}
												setIsPendingTwoFa(false);
												setTwoFaPassword("");
											}}
										>
											{isPendingTwoFa ? (
												<Loader2 size={15} className="animate-spin" />
											) : session?.user.twoFactorEnabled ? (
												"Disable 2FA"
											) : (
												"Enable 2FA"
											)}
										</Button>
									</DialogFooter>
								</DialogContent>
							</Dialog>
						</div>
					</div>
				</div>
			</CardContent>
			<CardFooter className="gap-2 justify-between items-center">
				<ChangePassword />
				{session?.session.impersonatedBy ? (
					<Button
						className="gap-2 z-10"
						variant="secondary"
						onClick={async () => {
							setIsSignOut(true);
							await client.admin.stopImpersonating();
							setIsSignOut(false);
							toast.info("Impersonation stopped successfully");
							router.push("/admin");
						}}
						disabled={isSignOut}
					>
						<span className="text-sm">
							{isSignOut ? (
								<Loader2 size={15} className="animate-spin" />
							) : (
								<div className="flex items-center gap-2">
									<StopCircle size={16} color="red" />
									Stop Impersonation
								</div>
							)}
						</span>
					</Button>
				) : (
					<Button
						className="gap-2 z-10"
						variant="secondary"
						onClick={async () => {
							setIsSignOut(true);
							await signOut({
								fetchOptions: {
									onSuccess() {
										router.push("/");
									},
								},
							});
							setIsSignOut(false);
						}}
						disabled={isSignOut}
					>
						<span className="text-sm">
							{isSignOut ? (
								<Loader2 size={15} className="animate-spin" />
							) : (
								<div className="flex items-center gap-2">
									<LogOut size={16} />
									Sign Out
								</div>
							)}
						</span>
					</Button>
				)}
			</CardFooter>
		</Card>
	);
}

async function convertImageToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

function ChangePassword() {
	const [currentPassword, setCurrentPassword] = useState<string>("");
	const [newPassword, setNewPassword] = useState<string>("");
	const [confirmPassword, setConfirmPassword] = useState<string>("");
	const [loading, setLoading] = useState<boolean>(false);
	const [open, setOpen] = useState<boolean>(false);
	const [signOutDevices, setSignOutDevices] = useState<boolean>(false);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button className="gap-2 z-10" variant="outline" size="sm">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1em"
						height="1em"
						viewBox="0 0 24 24"
					>
						<path
							fill="currentColor"
							d="M2.5 18.5v-1h19v1zm.535-5.973l-.762-.442l.965-1.693h-1.93v-.884h1.93l-.965-1.642l.762-.443L4 9.066l.966-1.643l.761.443l-.965 1.642h1.93v.884h-1.93l.965 1.693l-.762.442L4 10.835zm8 0l-.762-.442l.966-1.693H9.308v-.884h1.93l-.965-1.642l.762-.443L12 9.066l.966-1.643l.761.443l-.965 1.642h1.93v.884h-1.93l.965 1.693l-.762.442L12 10.835zm8 0l-.762-.442l.966-1.693h-1.931v-.884h1.93l-.965-1.642l.762-.443L20 9.066l.966-1.643l.761.443l-.965 1.642h1.93v.884h-1.93l.965 1.693l-.762.442L20 10.835z"
						></path>
					</svg>
					<span className="text-sm text-muted-foreground">Change Password</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px] w-11/12">
				<DialogHeader>
					<DialogTitle>Change Password</DialogTitle>
					<DialogDescription>Change your password</DialogDescription>
				</DialogHeader>
				<div className="grid gap-2">
					<Label htmlFor="current-password">Current Password</Label>
					<PasswordInput
						id="current-password"
						value={currentPassword}
						onChange={(e) => setCurrentPassword(e.target.value)}
						autoComplete="new-password"
						placeholder="Password"
					/>
					<Label htmlFor="new-password">New Password</Label>
					<PasswordInput
						value={newPassword}
						onChange={(e) => setNewPassword(e.target.value)}
						autoComplete="new-password"
						placeholder="New Password"
					/>
					<Label htmlFor="password">Confirm Password</Label>
					<PasswordInput
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						autoComplete="new-password"
						placeholder="Confirm Password"
					/>
					<div className="flex gap-2 items-center">
						<Checkbox
							onCheckedChange={(checked) =>
								checked ? setSignOutDevices(true) : setSignOutDevices(false)
							}
						/>
						<p className="text-sm">Sign out from other devices</p>
					</div>
				</div>
				<DialogFooter>
					<Button
						onClick={async () => {
							if (newPassword !== confirmPassword) {
								toast.error("Passwords do not match");
								return;
							}
							if (newPassword.length < 8) {
								toast.error("Password must be at least 8 characters");
								return;
							}
							setLoading(true);
							const res = await client.changePassword({
								newPassword: newPassword,
								currentPassword: currentPassword,
								revokeOtherSessions: signOutDevices,
							});
							setLoading(false);
							if (res.error) {
								toast.error(
									res.error.message ||
										"Couldn't change your password! Make sure it's correct",
								);
							} else {
								setOpen(false);
								toast.success("Password changed successfully");
								setCurrentPassword("");
								setNewPassword("");
								setConfirmPassword("");
							}
						}}
					>
						{loading ? (
							<Loader2 size={15} className="animate-spin" />
						) : (
							"Change Password"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function EditUserDialog() {
	const { data, isPending, error } = useSession();
	const [name, setName] = useState<string>();
	const router = useRouter();
	const [image, setImage] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			setImage(file);
			const reader = new FileReader();
			reader.onloadend = () => {
				setImagePreview(reader.result as string);
			};
			reader.readAsDataURL(file);
		}
	};
	const [open, setOpen] = useState<boolean>(false);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" className="gap-2" variant="secondary">
					<Edit size={13} />
					Edit User
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px] w-11/12">
				<DialogHeader>
					<DialogTitle>Edit User</DialogTitle>
					<DialogDescription>Edit user information</DialogDescription>
				</DialogHeader>
				<div className="grid gap-2">
					<Label htmlFor="name">Full Name</Label>
					<Input
						id="name"
						type="name"
						placeholder={data?.user.name}
						required
						onChange={(e) => {
							setName(e.target.value);
						}}
					/>
					<div className="grid gap-2">
						<Label htmlFor="image">Profile Image</Label>
						<div className="flex items-end gap-4">
							{imagePreview && (
								<div className="relative w-16 h-16 rounded-sm overflow-hidden">
									<Image
										src={imagePreview}
										alt="Profile preview"
										layout="fill"
										objectFit="cover"
									/>
								</div>
							)}
							<div className="flex items-center gap-2 w-full">
								<Input
									id="image"
									type="file"
									accept="image/*"
									onChange={handleImageChange}
									className="w-full text-muted-foreground"
								/>
								{imagePreview && (
									<X
										className="cursor-pointer"
										onClick={() => {
											setImage(null);
											setImagePreview(null);
										}}
									/>
								)}
							</div>
						</div>
					</div>
				</div>
				<DialogFooter>
					<Button
						disabled={isLoading}
						onClick={async () => {
							setIsLoading(true);
							await client.updateUser({
								image: image ? await convertImageToBase64(image) : undefined,
								name: name ? name : undefined,
								fetchOptions: {
									onSuccess: () => {
										toast.success("User updated successfully");
									},
									onError: (error) => {
										toast.error(error.error.message);
									},
								},
							});
							setName("");
							router.refresh();
							setImage(null);
							setImagePreview(null);
							setIsLoading(false);
							setOpen(false);
						}}
					>
						{isLoading ? (
							<Loader2 size={15} className="animate-spin" />
						) : (
							"Update"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function AddPasskey() {
	const [isOpen, setIsOpen] = useState(false);
	const [passkeyName, setPasskeyName] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleAddPasskey = async () => {
		if (!passkeyName) {
			toast.error("Passkey name is required");
			return;
		}
		setIsLoading(true);
		const res = await client.passkey.addPasskey({
			name: passkeyName,
		});
		if (res?.error) {
			toast.error(res?.error.message);
		} else {
			setIsOpen(false);
			toast.success("Passkey added successfully. You can now use it to login.");
		}
		setIsLoading(false);
	};
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" className="gap-2 text-xs md:text-sm">
					<Plus size={15} />
					Add New Passkey
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px] w-11/12">
				<DialogHeader>
					<DialogTitle>Add New Passkey</DialogTitle>
					<DialogDescription>
						Create a new passkey to securely access your account without a
						password.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-2">
					<Label htmlFor="passkey-name">Passkey Name</Label>
					<Input
						id="passkey-name"
						value={passkeyName}
						onChange={(e) => setPasskeyName(e.target.value)}
					/>
				</div>
				<DialogFooter>
					<Button
						disabled={isLoading}
						type="submit"
						onClick={handleAddPasskey}
						className="w-full"
					>
						{isLoading ? (
							<Loader2 size={15} className="animate-spin" />
						) : (
							<>
								<Fingerprint className="mr-2 h-4 w-4" />
								Create Passkey
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ListPasskeys() {
	const { data } = client.useListPasskeys();
	const [isOpen, setIsOpen] = useState(false);
	const [passkeyName, setPasskeyName] = useState("");

	const handleAddPasskey = async () => {
		if (!passkeyName) {
			toast.error("Passkey name is required");
			return;
		}
		setIsLoading(true);
		const res = await client.passkey.addPasskey({
			name: passkeyName,
		});
		setIsLoading(false);
		if (res?.error) {
			toast.error(res?.error.message);
		} else {
			toast.success("Passkey added successfully. You can now use it to login.");
		}
	};
	const [isLoading, setIsLoading] = useState(false);
	const [isDeletePasskey, setIsDeletePasskey] = useState<boolean>(false);
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" className="text-xs md:text-sm">
					<Fingerprint className="mr-2 h-4 w-4" />
					<span>Passkeys {data?.length ? `[${data?.length}]` : ""}</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px] w-11/12">
				<DialogHeader>
					<DialogTitle>Passkeys</DialogTitle>
					<DialogDescription>List of passkeys</DialogDescription>
				</DialogHeader>
				{data?.length ? (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.map((passkey) => (
								<TableRow
									key={passkey.id}
									className="flex  justify-between items-center"
								>
									<TableCell>{passkey.name || "My Passkey"}</TableCell>
									<TableCell className="text-right">
										<button
											onClick={async () => {
												const res = await client.passkey.deletePasskey({
													id: passkey.id,
													fetchOptions: {
														onRequest: () => {
															setIsDeletePasskey(true);
														},
														onSuccess: () => {
															toast("Passkey deleted successfully");
															setIsDeletePasskey(false);
														},
														onError: (error) => {
															toast.error(error.error.message);
															setIsDeletePasskey(false);
														},
													},
												});
											}}
										>
											{isDeletePasskey ? (
												<Loader2 size={15} className="animate-spin" />
											) : (
												<Trash
													size={15}
													className="cursor-pointer text-red-600"
												/>
											)}
										</button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				) : (
					<p className="text-sm text-muted-foreground">No passkeys found</p>
				)}
				{!data?.length && (
					<div className="flex flex-col gap-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="passkey-name" className="text-sm">
								New Passkey
							</Label>
							<Input
								id="passkey-name"
								value={passkeyName}
								onChange={(e) => setPasskeyName(e.target.value)}
								placeholder="My Passkey"
							/>
						</div>
						<Button type="submit" onClick={handleAddPasskey} className="w-full">
							{isLoading ? (
								<Loader2 size={15} className="animate-spin" />
							) : (
								<>
									<Fingerprint className="mr-2 h-4 w-4" />
									Create Passkey
								</>
							)}
						</Button>
					</div>
				)}
				<DialogFooter>
					<Button onClick={() => setIsOpen(false)}>Close</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
