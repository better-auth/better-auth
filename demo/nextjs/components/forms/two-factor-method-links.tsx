"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { usePendingTwoFactorChallengeQuery } from "@/data/user/two-factor-query";

type TwoFactorMethodLinksProps = {
	current: "totp" | "otp" | "recovery-code";
};

export function TwoFactorMethodLinks({ current }: TwoFactorMethodLinksProps) {
	const pendingChallengeQuery = usePendingTwoFactorChallengeQuery();
	const methods = pendingChallengeQuery.data?.methods ?? [];
	const hasTotp = methods.some((method) => method.kind === "totp");
	const hasOtp = methods.some((method) => method.kind === "otp");
	const hasRecoveryCode = methods.some(
		(method) => method.kind === "recovery-code",
	);

	return (
		<div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
			{hasTotp && current !== "totp" ? (
				<Button asChild variant="link" size="sm">
					<Link href="/two-factor">Use TOTP</Link>
				</Button>
			) : null}
			{hasOtp && current !== "otp" ? (
				<Button asChild variant="link" size="sm">
					<Link href="/two-factor/otp">Use Email OTP</Link>
				</Button>
			) : null}
			{hasRecoveryCode && current !== "recovery-code" ? (
				<Button asChild variant="link" size="sm">
					<Link href="/two-factor/recovery-code">Use Recovery Code</Link>
				</Button>
			) : null}
		</div>
	);
}
