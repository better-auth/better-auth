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
import { usePendingTwoFactorChallengeQuery } from "@/data/user/two-factor-query";
import { authClient } from "@/lib/auth-client";

const recoveryCodeSchema = z.object({
	code: z.string().min(8, "Enter a recovery code."),
});

type RecoveryCodeFormValues = z.infer<typeof recoveryCodeSchema>;

interface TwoFactorRecoveryCodeFormProps {
	onSuccess?: () => void;
	onError?: (error: string) => void;
}

export function TwoFactorRecoveryCodeForm({
	onSuccess,
	onError,
}: TwoFactorRecoveryCodeFormProps) {
	const pendingChallengeQuery = usePendingTwoFactorChallengeQuery();
	const [loading, startTransition] = useTransition();
	const [isVerified, setIsVerified] = useState(false);
	const recoveryMethodId = pendingChallengeQuery.data?.methods.find(
		(method) => method.kind === "recovery-code",
	)?.id;

	const form = useForm<RecoveryCodeFormValues>({
		resolver: zodResolver(recoveryCodeSchema),
		defaultValues: {
			code: "",
		},
	});

	const onSubmit = (data: RecoveryCodeFormValues) => {
		if (!recoveryMethodId) {
			onError?.("No recovery code method is available for this sign-in.");
			return;
		}
		startTransition(async () => {
			const res = await authClient.twoFactor.verify({
				methodId: recoveryMethodId,
				code: data.code.trim(),
			});
			if (res.data && !res.error) {
				setIsVerified(true);
				onSuccess?.();
			} else {
				onError?.("Invalid recovery code");
				form.setError("code", { message: "Invalid recovery code" });
			}
		});
	};

	if (pendingChallengeQuery.isLoading) {
		return (
			<div className="flex items-center justify-center py-4">
				<Loader2 className="h-5 w-5 animate-spin" />
			</div>
		);
	}

	if (!recoveryMethodId) {
		return (
			<p className="text-sm text-muted-foreground">
				This sign-in attempt does not have recovery codes available.
			</p>
		);
	}

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
							<FieldLabel htmlFor="recovery-code">Recovery Code</FieldLabel>
							<Input
								{...field}
								id="recovery-code"
								type="text"
								placeholder="Enter recovery code"
								aria-invalid={fieldState.invalid}
								autoCapitalize="off"
								autoCorrect="off"
								spellCheck={false}
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
					"Verify Recovery Code"
				)}
			</Button>
		</form>
	);
}
