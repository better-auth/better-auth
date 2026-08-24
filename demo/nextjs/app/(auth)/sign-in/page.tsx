"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import SignIn from "@/app/(auth)/sign-in/_components/sign-in";
import { SignUp } from "@/app/(auth)/sign-in/_components/sign-up";
import { Tabs } from "@/components/ui/tabs2";
import { authClient } from "@/lib/auth-client";
import { getCallbackURL } from "@/lib/shared";
import { cn } from "@/lib/utils";
import { ElectronTransferUser } from "./_components/electron";

export default function Page() {
	const [isLoading, startTransition] = useTransition();
	const [session, setSession] = useState<
		typeof authClient.$Infer.Session | null
	>(null);
	const router = useRouter();
	const params = useSearchParams();

	useEffect(() => {
		authClient.oneTap({
			fetchOptions: {
				query: params,
				onError: ({ error }) => {
					toast.error(error.message || "An error occurred");
				},
				onSuccess: () => {
					toast.success("Successfully signed in");
					router.push(getCallbackURL(params));
				},
			},
		});
	}, []);

	useEffect(() => {
		if (params.get("client_id") === "electron") {
			startTransition(async () => {
				const { data: session } = await authClient.getSession();
				if (session) {
					setSession(session);
				}
			});
		}
	}, [params]);

	return (
		<div className="w-full">
			<div
				className={cn(
					"flex items-center flex-col justify-center w-full md:py-10",
					(isLoading || session !== null) && "max-h-[calc(100vh-6.4688rem)]",
				)}
			>
				{!isLoading ? (
					<>
						{session !== null ? (
							<ElectronTransferUser session={session} />
						) : (
							<div className="w-full max-w-md">
								<Tabs
									tabs={[
										{
											title: "Sign In",
											value: "sign-in",
											content: <SignIn />,
										},
										{
											title: "Sign Up",
											value: "sign-up",
											content: <SignUp />,
										},
									]}
								/>
							</div>
						)}
					</>
				) : (
					<div className="text-center">
						<div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900 mx-auto"></div>
						<p className="mt-4 text-gray-600">Loading...</p>
					</div>
				)}
			</div>
		</div>
	);
}
