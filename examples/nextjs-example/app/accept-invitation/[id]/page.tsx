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
import { CheckIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { client, organization } from "@/lib/auth-client";
import { InvitationError } from "./invitation-error";

export default function InvitationPage() {
	const params = useParams<{
		id: string;
	}>();
	const router = useRouter();
	const [invitationStatus, setInvitationStatus] = useState<
		"pending" | "accepted" | "rejected"
	>("pending");

	const handleAccept = async () => {
		await organization
			.acceptInvitation({
				invitationId: params.id,
			})
			.then((res) => {
				if (res.error) {
					setError(res.error.message || "An error occurred");
				} else {
					setInvitationStatus("accepted");
					router.push(`/dashboard`);
				}
			});
	};

	const handleReject = async () => {
		await organization
			.rejectInvitation({
				invitationId: params.id,
			})
			.then((res) => {
				if (res.error) {
					setError(res.error.message || "An error occurred");
				} else {
					setInvitationStatus("rejected");
				}
			});
	};

	const [invitation, setInvitation] = useState<{
		organizationName: string;
		organizationSlug: string;
		inviterEmail: string;
		id: string;
		status: "pending" | "accepted" | "rejected" | "canceled";
		email: string;
		expiresAt: Date;
		organizationId: string;
		role: string;
		inviterId: string;
	} | null>(null);

	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		client.organization
			.getInvitation({
				query: {
					id: params.id,
				},
			})
			.then((res) => {
				if (res.error) {
					setError(res.error.message || "An error occurred");
				} else {
					setInvitation(res.data);
				}
			});
	}, []);

	return (
		<div className="min-h-[80vh] flex items-center justify-center">
			<div className="absolute pointer-events-none inset-0 flex items-center justify-center dark:bg-black bg-white [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]"></div>
			{invitation ? (
				<Card className="w-full max-w-md">
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
									<strong>{invitation?.inviterEmail}</strong> has invited you to
									join <strong>{invitation?.organizationName}</strong>.
								</p>
								<p>
									This invitation was sent to{" "}
									<strong>{invitation?.email}</strong>.
								</p>
							</div>
						)}
						{invitationStatus === "accepted" && (
							<div className="space-y-4">
								<div className="flex items-center justify-center w-16 h-16 mx-auto bg-green-100 rounded-full">
									<CheckIcon className="w-8 h-8 text-green-600" />
								</div>
								<h2 className="text-2xl font-bold text-center">
									Welcome to {invitation?.organizationName}!
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
									You&lsquo;ve declined the invitation to join{" "}
									{invitation?.organizationName}.
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
				</Card>
			) : error ? (
				<InvitationError />
			) : (
				<InvitationSkeleton />
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
	);
}
