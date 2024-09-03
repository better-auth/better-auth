"use client";
import { authClient } from "@/lib/auth-client";
import { useAuthStore } from "better-auth/react";
import { useState } from "react";
import { useEffect } from "react";
import { Button } from "./ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./ui/table";

export const Organization = () => {
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const organization = useAuthStore(authClient.$activeOrganization);
	const organizations = useAuthStore(authClient.$listOrganizations);

	return (
		<div className="flex items-center gap-2">
			<Card>
				<CardHeader>
					<CardTitle>Organization</CardTitle>
				</CardHeader>

				<CardContent>
					<div className="mb-2">
						<Label>Select Active Organization</Label>
						<Select
							value={organization?.id || "null"}
							onValueChange={(value) => {
								authClient.setActiveOrg(value);
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select organization" />
							</SelectTrigger>
							<SelectContent>
								{organizations?.map((org) => (
									<SelectItem value={org.id} key={org.id}>
										{org.name}
									</SelectItem>
								))}
								<SelectItem value="null">No organization</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{organization ? (
						<div>
							<div>{organization?.name}</div>
						</div>
					) : (
						<div className="flex flex-col gap-2">
							<div className="flex flex-col gap-1">
								<Label>Name</Label>
								<Input
									placeholder="Name"
									value={name}
									onChange={(e) => setName(e.currentTarget.value)}
								/>
							</div>
							<div className="flex flex-col gap-1">
								<Label>Slug</Label>
								<Input
									placeholder="Slug"
									value={slug}
									onChange={(e) => setSlug(e.currentTarget.value)}
								/>
							</div>
							<Button
								variant="outline"
								onClick={async () => {
									const res = await authClient.createOrganization({
										body: {
											name: name,
											slug: slug,
										},
									});
								}}
							>
								Create
							</Button>
						</div>
					)}
				</CardContent>
			</Card>
			{/* <Card>
				<CardHeader>
					<CardTitle>Invite Member</CardTitle>
				</CardHeader>
				<CardContent>
					<form className="flex flex-col gap-2">
						<Label>Email</Label>
						<Input
							placeholder="email"
							onChange={(e) => setEmail(e.target.value)}
							value={email}
						/>
						<Select onValueChange={(value) => setRole(value)}>
							<SelectTrigger>
								<SelectValue placeholder="Select role" />
							</SelectTrigger>
							<SelectContent>
								{organization?.roles.map((role) => (
									<SelectItem key={role.role} value={role.role}>
										{role.displayName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</form>
				</CardContent>
				<CardFooter>
					<Button
						onClick={async () => {
							await inviteMember({
								email,
								role: role as "member",
							});
						}}
					>
						Invite
					</Button>
				</CardFooter>
			</Card> */}
			{/* <Card>
				<CardHeader>
					<CardTitle>Members</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Email</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{organization?.members.map((member) => (
								<TableRow key={member.id}>
									<TableCell>{member.email}</TableCell>
									<TableCell>{member.role}</TableCell>
									<TableCell>Active</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Invitations</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Email</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{organization?.invitations.map((invitation) => (
								<TableRow key={invitation.id}>
									<TableCell>{invitation.email}</TableCell>
									<TableCell>{invitation.role}</TableCell>
									<TableCell>{invitation.status}</TableCell>
									<TableCell>
										<Button
											onClick={async () => {
												await client.updateInvitationStatus({
													invitationId: invitation.id,
													status: "cancelled",
												});
											}}
										>
											Accept
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card> */}
		</div>
	);
};
