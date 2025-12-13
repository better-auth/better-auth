"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Page() {
	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<Card className="w-full max-w-md p-6">
				<div className="space-y-4 text-center">
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
						<X className="h-6 w-6 text-red-600" />
					</div>

					<div>
						<h1 className="text-2xl font-bold">Device Denied</h1>
						<p className="text-muted-foreground mt-2">
							The device authorization request has been denied.
						</p>
					</div>

					<p className="text-sm text-muted-foreground">
						The device will not be able to access your account.
					</p>

					<Button asChild className="w-full">
						<Link href="/">Return to Home</Link>
					</Button>
				</div>
			</Card>
		</div>
	);
}
