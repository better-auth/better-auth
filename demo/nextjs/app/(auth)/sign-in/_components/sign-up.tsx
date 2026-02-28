"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SignUpForm } from "@/components/forms/sign-up-form";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { getCallbackURL } from "@/lib/shared";

export function SignUp() {
	const router = useRouter();
	const params = useSearchParams();

	return (
		<Card className="rounded-md rounded-t-none w-full">
			<CardHeader>
				<CardTitle className="text-lg md:text-xl">Sign Up</CardTitle>
				<CardDescription className="text-xs md:text-sm">
					Enter your information to create an account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<SignUpForm
					params={params}
					onSuccess={() => router.push(getCallbackURL(params))}
					callbackURL={getCallbackURL(params)}
				/>
			</CardContent>
			<CardFooter>
				<div className="flex justify-center w-full border-t pt-4">
					<p className="text-center text-xs text-neutral-500">
						built with{" "}
						<Link
							href="https://better-auth.com"
							className="underline"
							target="_blank"
						>
							<span className="dark:text-white/70 cursor-pointer">
								better-auth.
							</span>
						</Link>
					</p>
				</div>
			</CardFooter>
		</Card>
	);
}
