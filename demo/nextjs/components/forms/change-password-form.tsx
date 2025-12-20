"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { useChangePasswordMutation } from "@/data/user/change-password-mutation";

const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, "Current password is required"),
		newPassword: z
			.string()
			.min(8, "Password must be at least 8 characters")
			.max(128, "Password must be at most 128 characters"),
		confirmPassword: z.string().min(1, "Please confirm your password"),
		revokeOtherSessions: z.boolean(),
	})
	.refine((data) => data.newPassword === data.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

interface ChangePasswordFormProps {
	onSuccess?: () => void;
	onError?: (error: string) => void;
}

export function ChangePasswordForm({
	onSuccess,
	onError,
}: ChangePasswordFormProps) {
	const changePasswordMutation = useChangePasswordMutation();

	const {
		control,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<ChangePasswordFormValues>({
		resolver: zodResolver(changePasswordSchema),
		defaultValues: {
			currentPassword: "",
			newPassword: "",
			confirmPassword: "",
			revokeOtherSessions: false,
		},
	});

	const onSubmit = (values: ChangePasswordFormValues) => {
		changePasswordMutation.mutate(
			{
				currentPassword: values.currentPassword,
				newPassword: values.newPassword,
				revokeOtherSessions: values.revokeOtherSessions,
			},
			{
				onSuccess: () => {
					reset();
					onSuccess?.();
				},
				onError: (error) => {
					onError?.(error.message);
				},
			},
		);
	};

	return (
		<form onSubmit={handleSubmit(onSubmit)}>
			<FieldGroup>
				<Controller
					name="currentPassword"
					control={control}
					render={({ field }) => (
						<Field>
							<FieldLabel htmlFor="current-password">
								Current Password
							</FieldLabel>
							<PasswordInput
								id="current-password"
								autoComplete="current-password"
								placeholder="Current password"
								disabled={changePasswordMutation.isPending}
								{...field}
							/>
							<FieldError>{errors.currentPassword?.message}</FieldError>
						</Field>
					)}
				/>

				<Controller
					name="newPassword"
					control={control}
					render={({ field }) => (
						<Field>
							<FieldLabel htmlFor="new-password">New Password</FieldLabel>
							<PasswordInput
								id="new-password"
								autoComplete="new-password"
								placeholder="New password"
								disabled={changePasswordMutation.isPending}
								{...field}
							/>
							<FieldError>{errors.newPassword?.message}</FieldError>
						</Field>
					)}
				/>

				<Controller
					name="confirmPassword"
					control={control}
					render={({ field }) => (
						<Field>
							<FieldLabel htmlFor="confirm-password">
								Confirm Password
							</FieldLabel>
							<PasswordInput
								id="confirm-password"
								autoComplete="new-password"
								placeholder="Confirm password"
								disabled={changePasswordMutation.isPending}
								{...field}
							/>
							<FieldError>{errors.confirmPassword?.message}</FieldError>
						</Field>
					)}
				/>

				<Controller
					name="revokeOtherSessions"
					control={control}
					render={({ field }) => (
						<div className="flex gap-2 items-center">
							<Checkbox
								id="revoke-sessions"
								checked={field.value}
								onCheckedChange={field.onChange}
								disabled={changePasswordMutation.isPending}
							/>
							<label htmlFor="revoke-sessions" className="text-sm">
								Sign out from other devices
							</label>
						</div>
					)}
				/>

				<Button type="submit" disabled={changePasswordMutation.isPending}>
					{changePasswordMutation.isPending ? (
						<Loader2 size={15} className="animate-spin" />
					) : (
						"Change Password"
					)}
				</Button>
			</FieldGroup>
		</form>
	);
}
