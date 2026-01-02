"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTransition } from "react";
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
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth-client";

const resetPasswordSchema = z
	.object({
		password: z.string().min(8, "Password must be at least 8 characters."),
		confirmPassword: z.string().min(1, "Please confirm your password."),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match.",
		path: ["confirmPassword"],
	});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

interface ResetPasswordFormProps {
	token: string;
	onSuccess?: () => void;
}

export function ResetPasswordForm({
	token,
	onSuccess,
}: ResetPasswordFormProps) {
	const [loading, startTransition] = useTransition();

	const form = useForm<ResetPasswordFormValues>({
		resolver: zodResolver(resetPasswordSchema),
		defaultValues: {
			password: "",
			confirmPassword: "",
		},
	});

	const onSubmit = (data: ResetPasswordFormValues) => {
		startTransition(async () => {
			const res = await authClient.resetPassword({
				newPassword: data.password,
				token,
			});
			if (res.error) {
				toast.error(res.error.message);
				return;
			}
			toast.success("Password reset successfully");
			onSuccess?.();
		});
	};

	return (
		<form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
			<FieldGroup>
				<Controller
					name="password"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="reset-password">New password</FieldLabel>
							<PasswordInput
								{...field}
								id="reset-password"
								placeholder="Enter new password"
								aria-invalid={fieldState.invalid}
								autoComplete="new-password"
							/>
							{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
						</Field>
					)}
				/>
				<Controller
					name="confirmPassword"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="reset-confirm-password">
								Confirm password
							</FieldLabel>
							<PasswordInput
								{...field}
								id="reset-confirm-password"
								placeholder="Confirm new password"
								aria-invalid={fieldState.invalid}
								autoComplete="new-password"
							/>
							{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
						</Field>
					)}
				/>
			</FieldGroup>
			<Button type="submit" className="w-full" disabled={loading}>
				{loading ? (
					<Loader2 size={16} className="animate-spin" />
				) : (
					"Reset password"
				)}
			</Button>
		</form>
	);
}
