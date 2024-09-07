"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
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
import { authClient } from "@/lib/auth-client";
import {
	CheckIcon,
	ChevronDownIcon,
	MessageSquareText,
	PlusIcon,
	UserPlusIcon,
	Users,
	XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "./ui/badge";

// Mock data for organizations and members
const mockOrgs = [
	{ id: 1, name: "Acme Corp" },
	{ id: 2, name: "Globex Inc" },
];

const mockMembers = [
	{ id: 1, name: "John Doe", email: "john@example.com" },
	{ id: 2, name: "Jane Smith", email: "jane@example.com" },
];

export function Organization() {
	const organizations = authClient.useListOrganizations()
	const activeOrg = authClient.useActiveOrganization();
	const [members, setMembers] = useState(mockMembers);
	const [newOrgName, setNewOrgName] = useState("");
	const [newMemberEmail, setNewMemberEmail] = useState("");
	const [isCreateOrgOpen, setIsCreateOrgOpen] = useState(false);
	const [isInviteMemberOpen, setIsInviteMemberOpen] = useState(false);

	const handleCreateOrg = async () => {
		if (newOrgName) {
			await authClient.organization.create({
				name: newOrgName,
				slug: newOrgName.toLowerCase().replace(/\s+/g, "-"),
			});
			setNewOrgName("");
			setIsCreateOrgOpen(false);
		}
	};

	const handleInviteMember = async () => {
		if (newMemberEmail) {
			await authClient.organization.inviteMember({
				email: newMemberEmail,
				role: "member",
			});
			setNewMemberEmail("");
			setIsInviteMemberOpen(false);
		}
	};

	const [canCreate, setCanCreate] = useState(false);

	useEffect(() => {
		authClient.organization
			.hasPermission({
				permission: {
					invitation: ["create"],
				},
			})
			.then((res) => {
				if (res.data?.success) {
					setCanCreate(true);
				}
			});
	}, []);

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					Organization
				</CardTitle>

				<div className="flex space-x-4 !mt-3">
					<Dialog open={isCreateOrgOpen} onOpenChange={setIsCreateOrgOpen}>
						<DialogTrigger asChild>
							<Button>
								<PlusIcon className="w-4 h-4 mr-2" />
								Create Organization
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Create New Organization</DialogTitle>
								<DialogDescription>
									Enter the name for your new organization.
								</DialogDescription>
							</DialogHeader>
							<div className="py-4">
								<Label htmlFor="orgName">Organization Name</Label>
								<Input
									id="orgName"
									value={newOrgName}
									onChange={(e) => setNewOrgName(e.target.value)}
									placeholder="Enter organization name"
								/>
							</div>
							<DialogFooter>
								<Button onClick={handleCreateOrg}>Create</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline">
								{activeOrg ? activeOrg.name : "Select Organization"}
								<ChevronDownIcon className="w-4 h-4 ml-2" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							{organizations?.map((org) => (
								<DropdownMenuItem
									key={org.id}
									onSelect={() => authClient.organization.setActive(org.id)}
								>
									{org.name}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

			</CardHeader>
			<CardContent>
				{activeOrg && (
					<div className="space-y-4">
						{canCreate && (
							<Dialog
								open={isInviteMemberOpen}
								onOpenChange={setIsInviteMemberOpen}
							>
								<DialogTrigger asChild>
									<Button variant="secondary">
										<UserPlusIcon className="w-4 h-4 mr-2" />
										Invite Member
									</Button>
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Invite New Member</DialogTitle>
										<DialogDescription>
											Enter the email of the person you want to invite.
										</DialogDescription>
									</DialogHeader>
									<div className="py-4">
										<Label htmlFor="memberEmail">Member Email</Label>
										<Input
											id="memberEmail"
											value={newMemberEmail}
											onChange={(e) => setNewMemberEmail(e.target.value)}
											placeholder="Enter member email"
										/>
									</div>
									<DialogFooter>
										<Button onClick={handleInviteMember}>Invite</Button>
									</DialogFooter>
								</DialogContent>
							</Dialog>
						)}
					</div>
				)}
			</CardContent>
			<CardFooter>
				<Card>
					<CardHeader>
						<CardTitle>
							<div className="flex items-center gap-2">
								<Users />
								<h3 className="text-lg font-semibold">Members</h3>
							</div>
						</CardTitle>
					</CardHeader>
					<CardContent>

						<ul>
							{activeOrg?.members.map((member) => (
								<li
									key={member.id}
									className="flex justify-between items-center"
								>
									<span>{member.name}</span>
									<span className="text-sm text-muted-foreground">
										{member.role}
									</span>
								</li>
							))}
						</ul>
						<div>
							<div className="flex items-center gap-2 mt-4">
								<MessageSquareText size={18} />
								<h3 className=" font-semibold text-sm">
									Pending Invitations
								</h3>
							</div>
							<ul className="space-y-2">
								{activeOrg?.invitations
									.filter((invitation) => invitation.status === "pending")
									.map((invitation) => (
										<li
											key={invitation.id}
											className="flex justify-between items-center gap-2"
										>
											<span>{invitation.email}</span>
											<div className="flex items-center space-x-2">
												<Badge
													variant={
														invitation.status === "canceled"
															? "destructive"
															: "default"
													}
												>
													{invitation.status}
												</Badge>
												<Button
													size="sm"
													variant="outline"
													onClick={async () => {
														await authClient.organization.inviteMember({
															email: invitation.email,
															role: "member",
															resend: true,
														});
													}}
												>
													<CheckIcon className="w-4 h-4 mr-1" />
													Resend
												</Button>
												<Button
													size="sm"
													variant="outline"
													onClick={async () => {
														await authClient.organization.cancelInvitation({
															invitationId: invitation.id,
														});
													}}
												>
													<XIcon className="w-4 h-4 mr-1" />
													Cancel
												</Button>
											</div>
										</li>
									))}
							</ul>
						</div>
					</CardContent>
				</Card>
			</CardFooter>
		</Card>
	);
}
