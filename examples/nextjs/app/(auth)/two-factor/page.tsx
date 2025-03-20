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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { client } from "@/lib/auth-client";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function Component() {
	const [totpCode, setTotpCode] = useState("");
	const [error, setError] = useState("");
	const [success, setSuccess] = useState(false);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (totpCode.length !== 6 || !/^\d+$/.test(totpCode)) {
			setError("TOTP code must be 6 digits");
			return;
		}
		client.twoFactor
			.verifyTotp({
				code: totpCode,
			})
			.then((res) => {
				if (res.data?.token) {
					setSuccess(true);
					setError("");
				} else {
					setError("Invalid TOTP code");
				}
			});
	};

	return (
		<main className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
			<Card className="w-[350px]">
				<CardHeader>
					<CardTitle>TOTP Verification</CardTitle>
					<CardDescription>
						Enter your 6-digit TOTP code to authenticate
					</CardDescription>
				</CardHeader>
				<CardContent>
					{!success ? (
						<form onSubmit={handleSubmit}>
							<div className="space-y-2">
								<Label htmlFor="totp">TOTP Code</Label>
								<Input
									id="totp"
									type="text"
									inputMode="numeric"
									pattern="\d{6}"
									maxLength={6}
									value={totpCode}
									onChange={(e) => setTotpCode(e.target.value)}
									placeholder="Enter 6-digit code"
									required
								/>
							</div>
							{error && (
								<div className="flex items-center mt-2 text-red-500">
									<AlertCircle className="w-4 h-4 mr-2" />
									<span className="text-sm">{error}</span>
								</div>
							)}
							<Button type="submit" className="w-full mt-4">
								Verify
							</Button>
						</form>
					) : (
						<div className="flex flex-col items-center justify-center space-y-2">
							<CheckCircle2 className="w-12 h-12 text-green-500" />
							<p className="text-lg font-semibold">Verification Successful</p>
						</div>
					)}
				</CardContent>
				<CardFooter className="text-sm text-muted-foreground gap-2">
					<Link href="/two-factor/otp">
						<Button variant="link" size="sm">
							Switch to Email Verification
						</Button>
					</Link>
				</CardFooter>
			</Card>
		</main>
	);
}
