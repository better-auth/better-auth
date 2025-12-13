"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Page() {
	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<Card className="w-full max-w-md p-6">
				<div className="space-y-4 text-center">
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
						<Check className="h-6 w-6 text-green-600" />
					</div>

					<div>
						<h1 className="text-2xl font-bold">Device Approved</h1>
						<p className="text-muted-foreground mt-2">
							The device has been successfully authorized to access your
							account.
						</p>
					</div>

					<p className="text-sm text-muted-foreground">
						You can now return to your device to continue.
					</p>

					<Button asChild className="w-full">
						<Link href="/">Return to Home</Link>
					</Button>
				</div>
			</Card>
		</div>
	);
}
