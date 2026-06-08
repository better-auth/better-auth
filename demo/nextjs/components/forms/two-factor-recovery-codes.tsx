"use client";

import { Button } from "@/components/ui/button";
import CopyButton from "@/components/ui/copy-button";

interface TwoFactorRecoveryCodesProps {
	codes: string[];
	onDone?: () => void;
}

export function TwoFactorRecoveryCodes({
	codes,
	onDone,
}: TwoFactorRecoveryCodesProps) {
	return (
		<div className="flex flex-col gap-4">
			<div className="space-y-2">
				<p className="text-sm font-medium">Save your recovery codes</p>
				<p className="text-sm text-muted-foreground">
					You can use these one-time recovery codes if you lose access to your
					primary 2FA method.
				</p>
			</div>
			<div className="rounded-md border bg-muted/40 p-3">
				<ul className="grid gap-2 font-mono text-sm">
					{codes.map((code) => (
						<li key={code}>{code}</li>
					))}
				</ul>
			</div>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="text-sm text-muted-foreground">Copy codes</span>
					<CopyButton textToCopy={codes.join("\n")} />
				</div>
				<Button type="button" onClick={onDone}>
					Done
				</Button>
			</div>
		</div>
	);
}
