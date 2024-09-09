"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { CheckIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { InvitationError } from "./invitation-error";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

export default function InvitationPage({
	params,
}: {
	params: {
		id: string;
	};
}) {
	const [invitationStatus, setInvitationStatus] = useState<
		"pending" | "accepted" | "rejected"
	>("pending");

	const handleAccept = async () => {
		// In a real application, you would make an API call here

		await authClient.organization.acceptInvitation({
			invitationId: params.id,
		});
		setInvitationStatus("accepted");
	};

	const handleReject = () => {
		// In a real application, you would make an API call here
		setInvitationStatus("rejected");
	};

	const invitation = authClient.useInvitation();

	useEffect(() => {
		if (params.id) {
			authClient.organization.setInvitationId(params.id);
		}
	}, [params]);


	const session = authClient.useSession();

	return (
		<div className="min-h-screen flex items-center justify-center ">
			<div className="absolute pointer-events-none inset-0 flex items-center justify-center dark:bg-black bg-white [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]"></div>
			{
				invitation.data ? <Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>Organization Invitation</CardTitle>
						<CardDescription>
							You've been invited to join an organization
						</CardDescription>
					</CardHeader>
					<CardContent>
						{invitationStatus === "pending" && (
							<div className="space-y-4">
								<p>
									<strong>{invitation.data?.inviterEmail}</strong> has invited you
									to join <strong>{invitation.data?.organizationName}</strong>.
								</p>
								<p>
									This invitation was sent to{" "}
									<strong>{invitation.data?.email}</strong>.
								</p>
							</div>
						)}
						{invitationStatus === "accepted" && (
							<div className="space-y-4">
								<div className="flex items-center justify-center w-16 h-16 mx-auto bg-green-100 rounded-full">
									<CheckIcon className="w-8 h-8 text-green-600" />
								</div>
								<h2 className="text-2xl font-bold text-center">
									Welcome to {invitation.data?.organizationName}!
								</h2>
								<p className="text-center">
									You've successfully joined the organization. We're excited to
									have you on board!
								</p>
							</div>
						)}
						{invitationStatus === "rejected" && (
							<div className="space-y-4">
								<div className="flex items-center justify-center w-16 h-16 mx-auto bg-red-100 rounded-full">
									<XIcon className="w-8 h-8 text-red-600" />
								</div>
								<h2 className="text-2xl font-bold text-center">
									Invitation Declined
								</h2>
								<p className="text-center">
									You've declined the invitation to join{" "}
									{invitation.data?.organizationName}.
								</p>
							</div>
						)}
					</CardContent>
					{invitationStatus === "pending" && (
						<CardFooter className="flex justify-between">
							<Button variant="outline" onClick={handleReject}>
								Decline
							</Button>
							<Button onClick={handleAccept}>Accept Invitation</Button>
						</CardFooter>
					)}
				</Card> : invitation.error ? <InvitationError errorType={
					session ? "wrong-user" : "sign-in-required"
				} /> : <Card className="w-full max-w-md mx-auto">
					<CardHeader>
						<div className="flex items-center space-x-2">
							<Skeleton className="w-6 h-6 rounded-full" />
							<Skeleton className="h-6 w-24" />
						</div>
						<Skeleton className="h-4 w-full mt-2" />
						<Skeleton className="h-4 w-2/3 mt-2" />
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-2/3" />
						</div>
					</CardContent>
					<CardFooter className="flex justify-end">
						<Skeleton className="h-10 w-24" />
					</CardFooter>
				</Card>
			}
		</div>
	);
}
