"use client";

import { Auth } from "better-auth/react/Auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

export default function RegisterPage() {
	const router = useRouter();

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
			<div className="w-full max-w-md">
				<div className="text-center mb-8">
					<h1 className="text-3xl font-bold text-foreground">Create Account</h1>
					<p className="text-muted-foreground mt-2">
						Get started with our embedded Auth component
					</p>
				</div>
				<Auth
					ui={authClient.ui.signUp()}
					onSuccess={(data) => {
						toast.success("Account created successfully!");
						router.push(data.redirectTo || "/dashboard");
					}}
					onError={(error) => {
						toast.error(error.message || "Failed to create account");
					}}
				/>
				<p className="text-center text-sm text-muted-foreground mt-6">
					Already have an account?{" "}
					<Link href="/login" className="hover:underline text-primary">
						Sign in
					</Link>
				</p>
			</div>
		</div>
	);
}
