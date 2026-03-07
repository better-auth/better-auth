"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
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

const totpSchema = z.object({
	code: z
		.string()
		.length(6, "TOTP code must be 6 digits.")
		.regex(/^\d+$/, "TOTP code must be digits only."),
});

type TotpFormValues = z.infer<typeof totpSchema>;

interface TwoFactorTotpFormProps {
	onSuccess?: () => void;
	onError?: (error: string) => void;
}

export function TwoFactorTotpForm({
	onSuccess,
	onError,
}: TwoFactorTotpFormProps) {
	const [loading, startTransition] = useTransition();
	const [isVerified, setIsVerified] = useState(false);

	const form = useForm<TotpFormValues>({
		resolver: zodResolver(totpSchema),
		defaultValues: {
			code: "",
		},
	});

	const onSubmit = (data: TotpFormValues) => {
		startTransition(async () => {
			const res = await authClient.twoFactor.verifyTotp({
				code: data.code,
			});
			if (res.data?.token) {
				setIsVerified(true);
				onSuccess?.();
			} else {
				onError?.("Invalid TOTP code");
				form.setError("code", { message: "Invalid TOTP code" });
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

	return (
		<form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
			<FieldGroup>
				<Controller
					name="code"
					control={form.control}
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="totp-code">TOTP Code</FieldLabel>
							<Input
								{...field}
								id="totp-code"
								type="text"
								inputMode="numeric"
								maxLength={6}
								placeholder="Enter 6-digit code"
								aria-invalid={fieldState.invalid}
								autoComplete="one-time-code"
							/>
							{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
						</Field>
					)}
				/>
			</FieldGroup>
			<Button type="submit" className="w-full" disabled={loading}>
				{loading ? <Loader2 size={16} className="animate-spin" /> : "Verify"}
			</Button>
		</form>
	);
}
