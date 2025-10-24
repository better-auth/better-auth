"use client";

import { AlertCircle, CheckCircle2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { client } from "@/lib/auth-client";

export default function Component() {
	const [otp, setOtp] = useState("");
	const [isOtpSent, setIsOtpSent] = useState(false);
	const [message, setMessage] = useState("");
	const [isError, setIsError] = useState(false);
	const [isValidated, setIsValidated] = useState(false);

	// In a real app, this email would come from your authentication context
	const userEmail = "user@example.com";

	const requestOTP = async () => {
		const res = await client.twoFactor.sendOtp();
		// In a real app, this would call your backend API to send the OTP
		setMessage("OTP sent to your email");
		setIsError(false);
		setIsOtpSent(true);
	};
	const router = useRouter();

	const validateOTP = async () => {
		const res = await client.twoFactor.verifyOtp({
			code: otp,
		});
		if (res.data) {
			setMessage("OTP validated successfully");
			setIsError(false);
			setIsValidated(true);
			router.push("/");
		} else {
			setIsError(true);
			setMessage("Invalid OTP");
		}
	};
	return (
		<main className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
			<Card className="w-[350px]">
				<CardHeader>
					<CardTitle>Two-Factor Authentication</CardTitle>
					<CardDescription>
						Verify your identity with a one-time password
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid items-center w-full gap-4">
						{!isOtpSent ? (
							<Button onClick={requestOTP} className="w-full">
								<Mail className="w-4 h-4 mr-2" /> Send OTP to Email
							</Button>
						) : (
							<>
								<div className="flex flex-col space-y-1.5">
									<Label htmlFor="otp">One-Time Password</Label>
									<Label className="py-2">
										Check your email at {userEmail} for the OTP
									</Label>
									<Input
										id="otp"
										placeholder="Enter 6-digit OTP"
										value={otp}
										onChange={(e) => setOtp(e.target.value)}
										maxLength={6}
									/>
								</div>
								<Button
									onClick={validateOTP}
									disabled={otp.length !== 6 || isValidated}
								>
									Validate OTP
								</Button>
							</>
						)}
					</div>
					{message && (
						<div
							className={`flex items-center gap-2 mt-4 ${
								isError ? "text-red-500" : "text-primary"
							}`}
						>
							{isError ? (
								<AlertCircle className="w-4 h-4" />
							) : (
								<CheckCircle2 className="w-4 h-4" />
							)}
							<p className="text-sm">{message}</p>
						</div>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
