"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
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
import { userKeys } from "@/data/user/keys";
import { authClient } from "@/lib/auth-client";

const disableSchema = z.object({
	password: z.string(),
});

type DisableFormValues = z.infer<typeof disableSchema>;

interface TwoFactorDisableFormProps {
	onSuccess?: () => void;
}

export function TwoFactorDisableForm({ onSuccess }: TwoFactorDisableFormProps) {
	const queryClient = useQueryClient();
	const [loading, startTransition] = useTransition();

	const form = useForm<DisableFormValues>({
		resolver: zodResolver(disableSchema),
		defaultValues: {
			password: "",
		},
	});

	const onSubmit = (data: DisableFormValues) => {
		startTransition(async () => {
			await authClient.twoFactor.disable({
				password: data.password || undefined,
				fetchOptions: {
					async onSuccess() {
						await queryClient.invalidateQueries({
							queryKey: userKeys.twoFactorMethods(),
						});
						toast.success("2FA disabled successfully");
						onSuccess?.();
					},
					onError(context) {
						toast.error(context.error.message);
					},
				},
			});
		});
	};

	return (
		<form
			onSubmit={form.handleSubmit(onSubmit)}
			className="flex flex-col gap-4"
		>
			<FieldGroup>
				<Controller
					name="password"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="disable-password">Password</FieldLabel>
							<PasswordInput
								{...field}
								id="disable-password"
								placeholder="Enter your password if your account has one"
								aria-invalid={fieldState.invalid}
								autoComplete="current-password"
							/>
							{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
						</Field>
					)}
				/>
			</FieldGroup>
			<Button type="submit" variant="destructive" disabled={loading}>
				{loading ? (
					<Loader2 size={16} className="animate-spin" />
				) : (
					"Disable 2FA"
				)}
			</Button>
		</form>
	);
}
