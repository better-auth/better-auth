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

const forgetPasswordSchema = z.object({
	email: z.email("Please enter a valid email address."),
});

type ForgetPasswordFormValues = z.infer<typeof forgetPasswordSchema>;

interface ForgetPasswordFormProps {
	onSuccess?: () => void;
	onError?: (error: string) => void;
	redirectTo?: string;
}

export function ForgetPasswordForm({
	onSuccess,
	onError,
	redirectTo = "/reset-password",
}: ForgetPasswordFormProps) {
	const [loading, startTransition] = useTransition();

	const form = useForm<ForgetPasswordFormValues>({
		resolver: zodResolver(forgetPasswordSchema),
		defaultValues: {
			email: "",
		},
	});

	const onSubmit = (data: ForgetPasswordFormValues) => {
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
							<FieldLabel htmlFor="forget-email">Email</FieldLabel>
							<Input
								{...field}
								id="forget-email"
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
