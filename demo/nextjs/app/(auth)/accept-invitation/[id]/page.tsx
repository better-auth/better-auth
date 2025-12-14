"use client";

import { AlertCircle, CheckIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useInviteAcceptMutation } from "@/data/organization/invitation-accept-mutation";
import { useInvitationQuery } from "@/data/organization/invitation-query";
import { useInviteRejectMutation } from "@/data/organization/invitation-reject-mutation";

export default function Page() {
	const params = useParams<{
		id: string;
	}>();
	const router = useRouter();
	const [isRedirecting, setIsRedirecting] = useState(false);

	const { data: invitation, isLoading, error } = useInvitationQuery(params.id);
	const acceptMutation = useInviteAcceptMutation();
	const rejectMutation = useInviteRejectMutation();

	const handleAccept = () => {
		acceptMutation.mutate(
			{ invitationId: params.id },
			{
				onSuccess: () => {
					setIsRedirecting(true);
					router.push("/dashboard");
				},
			},
		);
	};

	const handleReject = () => {
		rejectMutation.mutate(
			{ invitationId: params.id },
			{
				onSuccess: () => {
					setIsRedirecting(true);
					router.push("/dashboard");
				},
			},
		);
	};

	if (isLoading || isRedirecting) {
		return (
			<div className="min-h-[80vh] flex items-center justify-center">
				<div className="absolute pointer-events-none inset-0 flex items-center justify-center dark:bg-black bg-white mask-[radial-gradient(ellipse_at_center,transparent_20%,black)]"></div>
				<InvitationSkeleton />
			</div>
		);
	}

	if (!invitation || error) {
		return (
			<div className="min-h-[80vh] flex items-center justify-center">
				<div className="absolute pointer-events-none inset-0 flex items-center justify-center dark:bg-black bg-white mask-[radial-gradient(ellipse_at_center,transparent_20%,black)]"></div>
				<InvitationError />
			</div>
		);
	}

	return (
		<div className="min-h-[80vh] flex items-center justify-center">
			<div className="absolute pointer-events-none inset-0 flex items-center justify-center dark:bg-black bg-white mask-[radial-gradient(ellipse_at_center,transparent_20%,black)]"></div>
			{invitation && (
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>Organization Invitation</CardTitle>
						<CardDescription>
							You've been invited to join an organization
						</CardDescription>
					</CardHeader>
					<CardContent>
						{invitation.status === "accepted" ? (
							<div className="space-y-4">
								<div className="flex items-center justify-center w-16 h-16 mx-auto bg-green-100 rounded-full">
									<CheckIcon className="w-8 h-8 text-green-600" />
								</div>
								<h2 className="text-2xl font-bold text-center">
									Welcome to {invitation.organizationName}!
								</h2>
								<p className="text-center">
									You've successfully joined the organization. We're excited to
									have you on board!
								</p>
							</div>
						) : invitation.status === "rejected" ? (
							<div className="space-y-4">
								<div className="flex items-center justify-center w-16 h-16 mx-auto bg-red-100 rounded-full">
									<XIcon className="w-8 h-8 text-red-600" />
								</div>
								<h2 className="text-2xl font-bold text-center">
									Invitation Declined
								</h2>
								<p className="text-center">
									You&lsquo;ve declined the invitation to join{" "}
									{invitation.organizationName}.
								</p>
							</div>
						) : (
							<div className="space-y-4">
								<p>
									<strong>{invitation.inviterEmail}</strong> has invited you to
									join <strong>{invitation.organizationName}</strong>.
								</p>
								<p>
									This invitation was sent to{" "}
									<strong>{invitation.email}</strong>.
								</p>
							</div>
						)}
					</CardContent>
					{invitation.status === "pending" && (
						<CardFooter className="flex justify-between">
							<Button
								variant="outline"
								onClick={handleReject}
								disabled={rejectMutation.isPending}
							>
								{rejectMutation.isPending ? "Declining..." : "Decline"}
							</Button>
							<Button
								onClick={handleAccept}
								disabled={acceptMutation.isPending}
							>
								{acceptMutation.isPending
									? "Accepting..."
									: "Accept Invitation"}
							</Button>
						</CardFooter>
					)}
				</Card>
			)}
		</div>
	);
}

function InvitationSkeleton() {
	return (
		<Card className="w-full max-w-md mx-auto">
			<CardHeader>
				<div className="flex items-center space-x-2">
					<Skeleton className="w-6 h-6 rounded-full" />
					<Skeleton className="h-6 w-24" />
				</div>
				<Skeleton className="h-4 w-full mt-2" />
			</CardHeader>
			<CardContent>
				<div className="space-y-2">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-2/3" />
				</div>
			</CardContent>
			<CardFooter className="flex justify-end">
				<Skeleton className="h-8 w-full" />
			</CardFooter>
		</Card>
	);
}

function InvitationError() {
	return (
		<Card className="w-full max-w-md mx-auto">
			<CardHeader>
				<div className="flex items-center space-x-2">
					<AlertCircle className="w-6 h-6 text-destructive" />
					<CardTitle className="text-xl text-destructive">
						Invitation Error
					</CardTitle>
				</div>
				<CardDescription>
					There was an issue with your invitation.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<p className="mb-4 text-sm text-muted-foreground">
					The invitation you're trying to access is either invalid or you don't
					have the correct permissions. Please check your email for a valid
					invitation or contact the person who sent it.
				</p>
			</CardContent>
			<CardFooter>
				<Link href="/" className="w-full">
					<Button variant="outline" className="w-full">
						Go back to home
					</Button>
				</Link>
			</CardFooter>
		</Card>
	);
}
