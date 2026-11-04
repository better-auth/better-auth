"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

const otpSchema = z.object({
	code: z
		.string()
		.length(6, "OTP code must be 6 digits.")
		.regex(/^\d+$/, "OTP code must be digits only."),
});

type OtpFormValues = z.infer<typeof otpSchema>;

interface TwoFactorEmailOtpFormProps {
	onSuccess?: () => void;
	onError?: (error: string) => void;
	userEmail?: string;
}

export function TwoFactorEmailOtpForm({
	onSuccess,
	onError,
	userEmail = "your email",
}: TwoFactorEmailOtpFormProps) {
	const [loading, startTransition] = useTransition();
	const [isOtpSent, setIsOtpSent] = useState(false);
	const [isVerified, setIsVerified] = useState(false);
	const [message, setMessage] = useState("");
	const [sendError, setSendError] = useState<string | null>(null);
	const active = useRef(true);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);

	const form = useForm<OtpFormValues>({
		resolver: zodResolver(otpSchema),
		defaultValues: {
			code: "",
		},
	});

	const handleSendOtp = () => {
		startTransition(async () => {
			setSendError(null);
			setMessage("");
			try {
				const { data, error } = await authClient.twoFactor.sendOtp();
				if (!active.current) return;
				if (error || !data?.status) {
					setSendError(error?.message ?? "Could not send the code. Try again.");
					return;
				}
				setIsOtpSent(true);
				setMessage(`OTP sent to ${userEmail}`);
			} catch {
				if (active.current) setSendError("Could not send the code. Try again.");
			}
		});
	};

	const onSubmit = (data: OtpFormValues) => {
		startTransition(async () => {
			setIsVerified(false);
			form.clearErrors("code");
			try {
				const { data: verified, error } = await authClient.twoFactor.verifyOtp({
					code: data.code,
				});
				if (!active.current) return;
				if (error || !verified?.token) {
					const message =
						error?.message ?? "Verification did not complete sign-in.";
					onError?.(message);
					form.setError("code", { message });
					return;
				}
				setIsVerified(true);
				onSuccess?.();
			} catch {
				if (!active.current) return;
				form.setError("code", {
					message: "Could not verify the code. Try again.",
				});
			}
		});
	};

	if (isVerified) {
		return (
			<div className="flex flex-col items-center justify-center space-y-2 py-4">
				<CheckCircle2 className="w-12 h-12 text-green-500" />
				<p className="text-lg font-semibold">Verification Successful</p>
			</div>
		);
	}

	if (!isOtpSent) {
		return (
			<div className="grid gap-4">
				{sendError && <p role="alert">{sendError}</p>}
				<Button onClick={handleSendOtp} className="w-full" disabled={loading}>
					{loading ? (
						<Loader2 size={16} className="animate-spin" />
					) : (
						<>
							<Mail className="w-4 h-4 mr-2" /> Send OTP to Email
						</>
					)}
				</Button>
			</div>
		);
	}

	return (
		<form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
			<FieldGroup>
				<Controller
					name="code"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="email-otp-code">
								One-Time Password
							</FieldLabel>
							{message && (
								<p className="text-sm text-muted-foreground flex items-center gap-1 py-1">
									<CheckCircle2 className="w-4 h-4 text-green-500" />
									{message}
								</p>
							)}
							<Input
								{...field}
								id="email-otp-code"
								disabled={loading}
								type="text"
								inputMode="numeric"
								maxLength={6}
								placeholder="Enter 6-digit OTP"
								aria-invalid={fieldState.invalid}
								autoComplete="one-time-code"
							/>
							{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
						</Field>
					)}
				/>
			</FieldGroup>
			<Button type="submit" className="w-full" disabled={loading || isVerified}>
				{loading ? (
					<Loader2 size={16} className="animate-spin" />
				) : (
					"Validate OTP"
				)}
			</Button>
		</form>
	);
}
