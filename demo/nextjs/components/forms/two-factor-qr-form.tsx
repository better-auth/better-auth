"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import CopyButton from "@/components/ui/copy-button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth-client";

const passwordSchema = z.object({
	password: z.string().min(8, "Password must be at least 8 characters."),
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

interface TwoFactorQrFormProps {
	onSuccess?: (totpURI: string) => void;
}

export function TwoFactorQrForm({ onSuccess }: TwoFactorQrFormProps) {
	const [loading, startTransition] = useTransition();
	const [totpURI, setTotpURI] = useState<string>("");

	const form = useForm<PasswordFormValues>({
		resolver: zodResolver(passwordSchema),
		defaultValues: {
			password: "",
		},
	});

	const onSubmit = (data: PasswordFormValues) => {
		startTransition(async () => {
			await authClient.twoFactor.getTotpUri(
				{ password: data.password },
				{
					onSuccess(context) {
						setTotpURI(context.data.totpURI);
						onSuccess?.(context.data.totpURI);
					},
					onError(context) {
						toast.error(context.error.message);
					},
				},
			);
		});
	};

	if (totpURI) {
		return (
			<div className="flex flex-col gap-4">
				<div className="flex items-center justify-center">
					<QRCode value={totpURI} />
				</div>
				<div className="flex gap-2 items-center justify-center">
					<p className="text-sm text-muted-foreground">Copy URI to clipboard</p>
					<CopyButton textToCopy={totpURI} />
				</div>
			</div>
		);
	}

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
							<FieldLabel htmlFor="qr-password">Password</FieldLabel>
							<PasswordInput
								{...field}
								id="qr-password"
								placeholder="Enter your password"
								aria-invalid={fieldState.invalid}
								autoComplete="current-password"
							/>
							{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
						</Field>
					)}
				/>
			</FieldGroup>
			<Button type="submit" disabled={loading}>
				{loading ? (
					<Loader2 size={16} className="animate-spin" />
				) : (
					"Show QR Code"
				)}
			</Button>
		</form>
	);
}
