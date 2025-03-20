"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	organization,
	useListOrganizations,
	useSession,
} from "@/lib/auth-client";
import { ActiveOrganization, Session } from "@/lib/auth-types";
import { ChevronDownIcon, PlusIcon } from "@radix-ui/react-icons";
import { Loader2, MailPlus } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import CopyButton from "@/components/ui/copy-button";
import Image from "next/image";

export function OrganizationCard(props: {
	session: Session | null;
	activeOrganization: ActiveOrganization | null;
}) {
	const organizations = useListOrganizations();
	const [optimisticOrg, setOptimisticOrg] = useState<ActiveOrganization | null>(
		props.activeOrganization,
	);
	const [isRevoking, setIsRevoking] = useState<string[]>([]);
	const inviteVariants = {
		hidden: { opacity: 0, height: 0 },
		visible: { opacity: 1, height: "auto" },
		exit: { opacity: 0, height: 0 },
	};

	const { data } = useSession();
	const session = data || props.session;

	const currentMember = optimisticOrg?.members.find(
		(member) => member.userId === session?.user.id,
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Organization</CardTitle>
				<div className="flex justify-between">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<div className="flex items-center gap-1 cursor-pointer">
								<p className="text-sm">
									<span className="font-bold"></span>{" "}
									{optimisticOrg?.name || "Personal"}
								</p>

								<ChevronDownIcon />
							</div>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							<DropdownMenuItem
								className=" py-1"
								onClick={async () => {
									organization.setActive({
										organizationId: null,
									});
									setOptimisticOrg(null);
								}}
							>
								<p className="text-sm sm">Personal</p>
							</DropdownMenuItem>
							{organizations.data?.map((org) => (
								<DropdownMenuItem
									className=" py-1"
									key={org.id}
									onClick={async () => {
										if (org.id === optimisticOrg?.id) {
											return;
										}
										setOptimisticOrg({
											members: [],
											invitations: [],
											...org,
										});
										const { data } = await organization.setActive({
											organizationId: org.id,
										});
										setOptimisticOrg(data);
									}}
								>
									<p className="text-sm sm">{org.name}</p>
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
					<div>
						<CreateOrganizationDialog />
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Avatar className="rounded-none">
						<AvatarImage
							className="object-cover w-full h-full rounded-none"
							src={optimisticOrg?.logo || undefined}
						/>
						<AvatarFallback className="rounded-none">
							{optimisticOrg?.name?.charAt(0) || "P"}
						</AvatarFallback>
					</Avatar>
					<div>
						<p>{optimisticOrg?.name || "Personal"}</p>
						<p className="text-xs text-muted-foreground">
							{optimisticOrg?.members.length || 1} members
						</p>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<div className="flex gap-8 flex-col md:flex-row">
					<div className="flex flex-col gap-2 flex-grow">
						<p className="font-medium border-b-2 border-b-foreground/10">
							Members
						</p>
						<div className="flex flex-col gap-2">
							{optimisticOrg?.members.map((member) => (
								<div
									key={member.id}
									className="flex justify-between items-center"
								>
									<div className="flex items-center gap-2">
										<Avatar className="sm:flex w-9 h-9">
											<AvatarImage
												src={member.user.image || undefined}
												className="object-cover"
											/>
											<AvatarFallback>
												{member.user.name?.charAt(0)}
											</AvatarFallback>
										</Avatar>
										<div>
											<p className="text-sm">{member.user.name}</p>
											<p className="text-xs text-muted-foreground">
												{member.role}
											</p>
										</div>
									</div>
									{member.role !== "owner" &&
										(currentMember?.role === "owner" ||
											currentMember?.role === "admin") && (
											<Button
												size="sm"
												variant="destructive"
												onClick={() => {
													organization.removeMember({
														memberIdOrEmail: member.id,
													});
												}}
											>
												{currentMember?.id === member.id ? "Leave" : "Remove"}
											</Button>
										)}
								</div>
							))}
							{!optimisticOrg?.id && (
								<div>
									<div className="flex items-center gap-2">
										<Avatar>
											<AvatarImage src={session?.user.image || undefined} />
											<AvatarFallback>
												{session?.user.name?.charAt(0)}
											</AvatarFallback>
										</Avatar>
										<div>
											<p className="text-sm">{session?.user.name}</p>
											<p className="text-xs text-muted-foreground">Owner</p>
										</div>
									</div>
								</div>
							)}
						</div>
					</div>
					<div className="flex flex-col gap-2 flex-grow">
						<p className="font-medium border-b-2 border-b-foreground/10">
							Invites
						</p>
						<div className="flex flex-col gap-2">
							<AnimatePresence>
								{optimisticOrg?.invitations
									.filter((invitation) => invitation.status === "pending")
									.map((invitation) => (
										<motion.div
											key={invitation.id}
											className="flex items-center justify-between"
											variants={inviteVariants}
											initial="hidden"
											animate="visible"
											exit="exit"
											layout
										>
											<div>
												<p className="text-sm">{invitation.email}</p>
												<p className="text-xs text-muted-foreground">
													{invitation.role}
												</p>
											</div>
											<div className="flex items-center gap-2">
												<Button
													disabled={isRevoking.includes(invitation.id)}
													size="sm"
													variant="destructive"
													onClick={() => {
														organization.cancelInvitation(
															{
																invitationId: invitation.id,
															},
															{
																onRequest: () => {
																	setIsRevoking([...isRevoking, invitation.id]);
																},
																onSuccess: () => {
																	toast.message(
																		"Invitation revoked successfully",
																	);
																	setIsRevoking(
																		isRevoking.filter(
																			(id) => id !== invitation.id,
																		),
																	);
																	setOptimisticOrg({
																		...optimisticOrg,
																		invitations:
																			optimisticOrg?.invitations.filter(
																				(inv) => inv.id !== invitation.id,
																			),
																	});
																},
																onError: (ctx) => {
																	toast.error(ctx.error.message);
																	setIsRevoking(
																		isRevoking.filter(
																			(id) => id !== invitation.id,
																		),
																	);
																},
															},
														);
													}}
												>
													{isRevoking.includes(invitation.id) ? (
														<Loader2 className="animate-spin" size={16} />
													) : (
														"Revoke"
													)}
												</Button>
												<div>
													<CopyButton
														textToCopy={`${window.location.origin}/accept-invitation/${invitation.id}`}
													/>
												</div>
											</div>
										</motion.div>
									))}
							</AnimatePresence>
							{optimisticOrg?.invitations.length === 0 && (
								<motion.p
									className="text-sm text-muted-foreground"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
								>
									No Active Invitations
								</motion.p>
							)}
							{!optimisticOrg?.id && (
								<Label className="text-xs text-muted-foreground">
									You can&apos;t invite members to your personal workspace.
								</Label>
							)}
						</div>
					</div>
				</div>
				<div className="flex justify-end w-full mt-4">
					<div>
						<div>
							{optimisticOrg?.id && (
								<InviteMemberDialog
									setOptimisticOrg={setOptimisticOrg}
									optimisticOrg={optimisticOrg}
								/>
							)}
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function CreateOrganizationDialog() {
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [loading, setLoading] = useState(false);
	const [open, setOpen] = useState(false);
	const [isSlugEdited, setIsSlugEdited] = useState(false);
	const [logo, setLogo] = useState<string | null>(null);

	useEffect(() => {
		if (!isSlugEdited) {
			const generatedSlug = name.trim().toLowerCase().replace(/\s+/g, "-");
			setSlug(generatedSlug);
		}
	}, [name, isSlugEdited]);

	useEffect(() => {
		if (open) {
			setName("");
			setSlug("");
			setIsSlugEdited(false);
			setLogo(null);
		}
	}, [open]);

	const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files[0]) {
			const file = e.target.files[0];
			const reader = new FileReader();
			reader.onloadend = () => {
				setLogo(reader.result as string);
			};
			reader.readAsDataURL(file);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" className="w-full gap-2" variant="default">
					<PlusIcon />
					<p>New Organization</p>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px] w-11/12">
				<DialogHeader>
					<DialogTitle>New Organization</DialogTitle>
					<DialogDescription>
						Create a new organization to collaborate with your team.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label>Organization Name</Label>
						<Input
							placeholder="Name"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label>Organization Slug</Label>
						<Input
							value={slug}
							onChange={(e) => {
								setSlug(e.target.value);
								setIsSlugEdited(true);
							}}
							placeholder="Slug"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label>Logo</Label>
						<Input type="file" accept="image/*" onChange={handleLogoChange} />
						{logo && (
							<div className="mt-2">
								<Image
									src={logo}
									alt="Logo preview"
									className="w-16 h-16 object-cover"
									width={16}
									height={16}
								/>
							</div>
						)}
					</div>
				</div>
				<DialogFooter>
					<Button
						disabled={loading}
						onClick={async () => {
							setLoading(true);
							await organization.create(
								{
									name: name,
									slug: slug,
									logo: logo || undefined,
								},
								{
									onResponse: () => {
										setLoading(false);
									},
									onSuccess: () => {
										toast.success("Organization created successfully");
										setOpen(false);
									},
									onError: (error) => {
										toast.error(error.error.message);
										setLoading(false);
									},
								},
							);
						}}
					>
						{loading ? (
							<Loader2 className="animate-spin" size={16} />
						) : (
							"Create"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function InviteMemberDialog({
	setOptimisticOrg,
	optimisticOrg,
}: {
	setOptimisticOrg: (org: ActiveOrganization | null) => void;
	optimisticOrg: ActiveOrganization | null;
}) {
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState("member");
	const [loading, setLoading] = useState(false);
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button size="sm" className="w-full gap-2" variant="secondary">
					<MailPlus size={16} />
					<p>Invite Member</p>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px] w-11/12">
				<DialogHeader>
					<DialogTitle>Invite Member</DialogTitle>
					<DialogDescription>
						Invite a member to your organization.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<Label>Email</Label>
					<Input
						placeholder="Email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
					<Label>Role</Label>
					<Select value={role} onValueChange={setRole}>
						<SelectTrigger>
							<SelectValue placeholder="Select a role" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="admin">Admin</SelectItem>
							<SelectItem value="member">Member</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<DialogFooter>
					<DialogClose>
						<Button
							disabled={loading}
							onClick={async () => {
								const invite = organization.inviteMember({
									email: email,
									role: role as "member",
									fetchOptions: {
										throw: true,
										onSuccess: (ctx) => {
											if (optimisticOrg) {
												setOptimisticOrg({
													...optimisticOrg,
													invitations: [
														...(optimisticOrg?.invitations || []),
														ctx.data,
													],
												});
											}
										},
									},
								});
								toast.promise(invite, {
									loading: "Inviting member...",
									success: "Member invited successfully",
									error: (error) => error.error.message,
								});
							}}
						>
							Invite
						</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
