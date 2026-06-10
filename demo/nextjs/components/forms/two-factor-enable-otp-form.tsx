"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { userKeys } from "@/data/user/keys";
import { authClient } from "@/lib/auth-client";
import { TwoFactorRecoveryCodes } from "./two-factor-recovery-codes";

const passwordSchema = z.object({
	password: z.string(),
	label: z.string().optional(),
});

const otpSchema = z.object({
	code: z
		.string()
		.length(6, "OTP code must be 6 digits.")
		.regex(/^\d+$/, "OTP code must be digits only."),
});

type PasswordFormValues = z.infer<typeof passwordSchema>;
type OtpFormValues = z.infer<typeof otpSchema>;

interface TwoFactorEnableOtpFormProps {
	onSuccess?: () => void;
}

export function TwoFactorEnableOtpForm({
	onSuccess,
}: TwoFactorEnableOtpFormProps) {
	const queryClient = useQueryClient();
	const [loading, startTransition] = useTransition();
	const [methodId, setMethodId] = useState("");
	const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
	const [isVerified, setIsVerified] = useState(false);

	const passwordForm = useForm<PasswordFormValues>({
		resolver: zodResolver(passwordSchema),
		defaultValues: {
			password: "",
			label: "Email OTP",
		},
	});

	const otpForm = useForm<OtpFormValues>({
		resolver: zodResolver(otpSchema),
		defaultValues: {
			code: "",
		},
	});

	const onPasswordSubmit = (data: PasswordFormValues) => {
		startTransition(async () => {
			await authClient.twoFactor.enableOtp({
				password: data.password || undefined,
				label: data.label || undefined,
				fetchOptions: {
					async onSuccess(ctx) {
						setMethodId(ctx.data.method.id);
						setRecoveryCodes(ctx.data.recoveryCodes);
						await queryClient.invalidateQueries({
							queryKey: userKeys.twoFactorMethods(),
						});
						toast.success(
							"Email OTP sent. Check the server logs for local testing.",
						);
					},
					onError(context) {
						toast.error(context.error.message);
					},
				},
			});
		});
	};

	const onOtpSubmit = (data: OtpFormValues) => {
		startTransition(async () => {
			await authClient.twoFactor.verify({
				methodId,
				code: data.code,
				fetchOptions: {
					async onSuccess() {
						await queryClient.invalidateQueries({
							queryKey: userKeys.twoFactorMethods(),
						});
						setIsVerified(true);
						toast.success("Email OTP enabled successfully");
					},
					onError(context) {
						toast.error(context.error.message);
						otpForm.reset();
					},
				},
			});
		});
	};

	if (isVerified) {
		return <TwoFactorRecoveryCodes codes={recoveryCodes} onDone={onSuccess} />;
	}

	if (methodId) {
		return (
			<form
				onSubmit={otpForm.handleSubmit(onOtpSubmit)}
				className="flex flex-col gap-4"
			>
				<FieldGroup>
					<Controller
						name="code"
						control={otpForm.control}
						render={({ field, fieldState }) => (
							<Field data-invalid={fieldState.invalid}>
								<FieldLabel htmlFor="enable-email-otp-code">
									Enter the email OTP code
								</FieldLabel>
								<Input
									{...field}
									id="enable-email-otp-code"
									inputMode="numeric"
									maxLength={6}
									placeholder="Enter 6-digit code"
									aria-invalid={fieldState.invalid}
									autoComplete="one-time-code"
								/>
								{fieldState.invalid && (
									<FieldError errors={[fieldState.error]} />
								)}
							</Field>
						)}
					/>
				</FieldGroup>
				<Button type="submit" disabled={loading}>
					{loading ? (
						<Loader2 size={16} className="animate-spin" />
					) : (
						"Verify & Enable"
					)}
				</Button>
			</form>
		);
	}

	return (
		<form
			onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
			className="flex flex-col gap-4"
		>
			<FieldGroup>
				<Controller
					name="label"
					control={passwordForm.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="enable-email-otp-label">Label</FieldLabel>
							<Input
								{...field}
								id="enable-email-otp-label"
								placeholder="Email OTP"
								aria-invalid={fieldState.invalid}
							/>
							{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
						</Field>
					)}
				/>
				<Controller
					name="password"
					control={passwordForm.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="enable-email-otp-password">
								Password
							</FieldLabel>
							<PasswordInput
								{...field}
								id="enable-email-otp-password"
								placeholder="Enter your password if your account has one"
								aria-invalid={fieldState.invalid}
								autoComplete="current-password"
							/>
							{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
						</Field>
					)}
				/>
			</FieldGroup>
			<Button type="submit" disabled={loading}>
				{loading ? <Loader2 size={16} className="animate-spin" /> : "Send Code"}
			</Button>
		</form>
	);
}
