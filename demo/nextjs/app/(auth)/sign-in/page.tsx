"use client";

import SignIn from "@/components/sign-in";
import { SignUp } from "@/components/sign-up";
import { Tabs } from "@/components/ui/tabs2";
import { client } from "@/lib/auth-client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

export default function Page() {
	const router = useRouter();
	const params = useParams();
	useEffect(() => {
		client.oneTap({
			fetchOptions: {
				onError: ({ error }) => {
					toast.error(error.message || "An error occurred");
				},
				onSuccess: () => {
					toast.success("Successfully signed in");
					if (typeof params.callbackUrl === "string") {
						router.push(params.callbackUrl);
					} else {
						router.push("/dashboard");
					}
				},
			},
		});
	}, []);

	return (
		<div className="w-full">
			<div className="flex items-center flex-col justify-center w-full md:py-10">
				<div className="md:w-[400px]">
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
			</div>
		</div>
	);
}
