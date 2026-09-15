"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { SCIMDemoUserKey } from "@/lib/scim-demo-catalog";

export interface IdentityProviderAccount {
	displayName: string;
	email: string;
	givenName: string;
	initials: string;
	userKey: SCIMDemoUserKey;
}

export interface IdentityProviderAuthorizationField {
	name: string;
	value: string;
}

interface AccountConfirmationProps {
	account: IdentityProviderAccount;
	authorizationFields: readonly IdentityProviderAuthorizationField[];
}

export function AccountConfirmation({
	account,
	authorizationFields,
}: AccountConfirmationProps) {
	const [isContinuing, setIsContinuing] = useState(false);

	return (
		<form
			action="/api/scim-demo/idp/authorize"
			method="post"
			onSubmit={() => setIsContinuing(true)}
		>
			{authorizationFields.map((field) => (
				<input
					key={field.name}
					type="hidden"
					name={field.name}
					value={field.value}
				/>
			))}

			<div className="flex min-h-16 items-center gap-3 border bg-muted/40 p-3">
				<Avatar className="size-10 border">
					<AvatarFallback className="bg-muted text-xs">
						{account.initials}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					<p className="font-medium">{account.displayName}</p>
					<p className="mt-0.5 truncate text-xs text-muted-foreground">
						{account.email}
					</p>
				</div>
			</div>

			<Button
				type="submit"
				className="mt-5 min-h-11 w-full gap-2"
				disabled={isContinuing}
			>
				{isContinuing ? (
					<Loader2
						className="size-4 animate-spin motion-reduce:animate-none"
						aria-hidden="true"
					/>
				) : null}
				{isContinuing ? "Signing in…" : `Continue as ${account.givenName}`}
			</Button>
		</form>
	);
}
