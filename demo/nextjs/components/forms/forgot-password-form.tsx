"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTransition } from "react";
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

const forgotPasswordSchema = z.object({
	email: z.email("Please enter a valid email address."),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

interface ForgotPasswordFormProps {
	onSuccess?: () => void;
	onError?: (error: string) => void;
	redirectTo?: string;
}

export function ForgotPasswordForm({
	onSuccess,
	onError,
	redirectTo = "/reset-password",
}: ForgotPasswordFormProps) {
	const [loading, startTransition] = useTransition();

	const form = useForm<ForgotPasswordFormValues>({
		resolver: zodResolver(forgotPasswordSchema),
		defaultValues: {
			email: "",
		},
	});

	const onSubmit = (data: ForgotPasswordFormValues) => {
		startTransition(async () => {
			try {
				await authClient.requestPasswordReset({
					email: data.email,
					redirectTo,
				});
				onSuccess?.();
			} catch {
				onError?.("An error occurred. Please try again.");
			}
		});
	};

	return (
		<form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
			<FieldGroup>
				<Controller
					name="email"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="forgot-email">Email</FieldLabel>
							<Input
								{...field}
								id="forgot-email"
								type="email"
								placeholder="Enter your email"
								aria-invalid={fieldState.invalid}
								autoComplete="email"
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
					"Send reset link"
				)}
			</Button>
		</form>
	);
}
