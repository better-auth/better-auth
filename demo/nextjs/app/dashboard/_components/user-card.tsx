"use client";

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
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { UAParser } from "ua-parser-js";
import { ChangePasswordForm } from "@/components/forms/change-password-form";
import { TwoFactorDisableForm } from "@/components/forms/two-factor-disable-form";
import { TwoFactorEnableForm } from "@/components/forms/two-factor-enable-form";
import { TwoFactorQrForm } from "@/components/forms/two-factor-qr-form";
import { UpdateUserForm } from "@/components/forms/update-user-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useRevokeSessionMutation } from "@/data/user/revoke-session-mutation";
import { useSessionQuery } from "@/data/user/session-query";
import { useSignOutMutation } from "@/data/user/sign-out-mutation";
import type { Session } from "@/lib/auth";
import { authClient } from "@/lib/auth-client";

const UserCard = (props: {
	session: Session | null;
	activeSessions: Session["session"][];
}) => {
	const router = useRouter();
	const signOutMutation = useSignOutMutation();
	const revokeSessionMutation = useRevokeSessionMutation();
	const { data } = useSessionQuery();
	const session = data || props.session;
	const [twoFactorDialog, setTwoFactorDialog] = useState<boolean>(false);
	const [isSignOut, setIsSignOut] = useState<boolean>(false);
	const [emailVerificationPending, setEmailVerificationPending] =
		useState<boolean>(false);
	const [activeSessions, setActiveSessions] = useState(props.activeSessions);
	const removeActiveSession = (id: string) =>
		setActiveSessions(activeSessions.filter((session) => session.id !== id));

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
								</div>
								<p className="text-sm">{session?.user.email}</p>
							</div>
						</div>
						<EditUserDialog />
					</div>
				</div>{" "}
				{session?.user.emailVerified ? null : (
					<Alert>
						<AlertTitle>Verify Your Email Address</AlertTitle>
						<AlertDescription className="text-muted-foreground">
							Please verify your email address. Check your inbox for the
							verification email. If you haven't received the email, click the
							button below to resend.
							<Button
								size="sm"
								variant="secondary"
								className="mt-2"
								onClick={async () => {
									await authClient.sendVerificationEmail(
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
						</AlertDescription>
					</Alert>
				)}
				<div className="border-l-2 px-2 w-max gap-1 flex flex-col">
					<p className="text-xs font-medium ">Active Sessions</p>
					{activeSessions
						.filter((session) => session.userAgent)
						.map((session) => {
							const isCurrentSession = session.id === props.session?.session.id;
							const isTerminating =
								revokeSessionMutation.isPending &&
								revokeSessionMutation.variables?.token === session.token;

							return (
								<div key={session.id}>
									<div className="flex items-center gap-2 text-sm  text-black font-medium dark:text-white">
										{new UAParser(session.userAgent || "").getDevice().type ===
										"mobile" ? (
											<MobileIcon />
										) : (
											<Laptop size={16} />
										)}
										{new UAParser(session.userAgent || "").getOS().name ||
											session.userAgent}
										, {new UAParser(session.userAgent || "").getBrowser().name}
										<button
											className="text-red-500 opacity-80 cursor-pointer text-xs underline"
											onClick={() => {
												revokeSessionMutation.mutate(
													{ token: session.token },
													{
														onSuccess: () => {
															removeActiveSession(session.id);
															if (isCurrentSession) {
																router.push("/");
															}
														},
													},
												);
											}}
										>
											{isTerminating ? (
												<Loader2 size={15} className="animate-spin" />
											) : isCurrentSession ? (
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
										<TwoFactorQrForm />
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
									{session?.user.twoFactorEnabled ? (
										<TwoFactorDisableForm
											onSuccess={() => setTwoFactorDialog(false)}
										/>
									) : (
										<TwoFactorEnableForm
											onSuccess={() => setTwoFactorDialog(false)}
										/>
									)}
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
							await authClient.admin.stopImpersonating();
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
						variant="outline"
						onClick={() => {
							signOutMutation.mutate(undefined, {
								onSuccess: () => {
									router.push("/");
								},
							});
						}}
						disabled={signOutMutation.isPending}
					>
						<span className="text-sm">
							{signOutMutation.isPending ? (
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
};
export default UserCard;

function ChangePassword() {
	const [open, setOpen] = useState<boolean>(false);

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
				<ChangePasswordForm onSuccess={() => setOpen(false)} />
			</DialogContent>
		</Dialog>
	);
}

function EditUserDialog() {
	const { data } = useSessionQuery();
	const [open, setOpen] = useState<boolean>(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" className="gap-2" variant="default">
					<Edit size={13} />
					Edit User
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px] w-11/12">
				<DialogHeader>
					<DialogTitle>Edit User</DialogTitle>
					<DialogDescription>Edit user information</DialogDescription>
				</DialogHeader>
				<UpdateUserForm
					currentName={data?.user.name}
					onSuccess={() => setOpen(false)}
				/>
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
		const res = await authClient.passkey.addPasskey({
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
						onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
							setPasskeyName(e.target.value)
						}
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
	const { data } = authClient.useListPasskeys();
	const [isOpen, setIsOpen] = useState(false);
	const [passkeyName, setPasskeyName] = useState("");

	const handleAddPasskey = async () => {
		if (!passkeyName) {
			toast.error("Passkey name is required");
			return;
		}
		setIsLoading(true);
		const res = await authClient.passkey.addPasskey({
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
												await authClient.passkey.deletePasskey({
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
								onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
									setPasskeyName(e.target.value)
								}
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
