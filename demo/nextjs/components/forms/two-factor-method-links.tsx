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
				<Link href="/two-factor">
					<Button variant="link" size="sm">
						Use TOTP
					</Button>
				</Link>
			) : null}
			{hasOtp && current !== "otp" ? (
				<Link href="/two-factor/otp">
					<Button variant="link" size="sm">
						Use Email OTP
					</Button>
				</Link>
			) : null}
			{hasRecoveryCode && current !== "recovery-code" ? (
				<Link href="/two-factor/recovery-code">
					<Button variant="link" size="sm">
						Use Recovery Code
					</Button>
				</Link>
			) : null}
		</div>
	);
}
