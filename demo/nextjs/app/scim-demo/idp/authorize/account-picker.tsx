"use client";

import { Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

interface AccountPickerProps {
	accounts: readonly IdentityProviderAccount[];
	authorizationFields: readonly IdentityProviderAuthorizationField[];
}

export function AccountPicker({
	accounts,
	authorizationFields,
}: AccountPickerProps) {
	const fieldId = useId();
	const [selectedUserKey, setSelectedUserKey] =
		useState<SCIMDemoUserKey | null>(null);
	const [isContinuing, setIsContinuing] = useState(false);
	const selectedAccount = accounts.find(
		(account) => account.userKey === selectedUserKey,
	);

	return (
		<form
			action="/api/scim-demo/idp/authorize"
			method="post"
			onSubmit={(event) => {
				if (!selectedUserKey) {
					event.preventDefault();
					return;
				}
				setIsContinuing(true);
			}}
		>
			{authorizationFields.map((field) => (
				<input
					key={field.name}
					type="hidden"
					name={field.name}
					value={field.value}
				/>
			))}
			{selectedUserKey ? (
				<input type="hidden" name="user_key" value={selectedUserKey} />
			) : null}

			<fieldset disabled={isContinuing}>
				<legend className="sr-only">Acme employee accounts</legend>
				<RadioGroup
					className="gap-2"
					value={selectedUserKey ?? ""}
					onValueChange={(value) => {
						const nextAccount = accounts.find(
							(account) => account.userKey === value,
						);
						setSelectedUserKey(nextAccount?.userKey ?? null);
					}}
					aria-label="Acme employee accounts"
				>
					{accounts.map((account) => {
						const accountId = `${fieldId}-${account.userKey}`;
						const descriptionId = `${accountId}-email`;
						return (
							<div
								key={account.userKey}
								className="relative flex min-h-16 cursor-pointer items-center gap-3 border bg-background p-3 transition-colors has-data-[state=checked]:border-foreground has-data-[state=checked]:bg-muted/40"
							>
								<RadioGroupItem
									id={accountId}
									value={account.userKey}
									aria-describedby={descriptionId}
									className="order-3 after:absolute after:inset-0 after:content-['']"
								/>
								<Avatar className="size-10 border">
									<AvatarFallback className="bg-muted text-xs">
										{account.initials}
									</AvatarFallback>
								</Avatar>
								<div className="min-w-0 flex-1">
									<Label htmlFor={accountId} className="font-medium">
										{account.displayName}
									</Label>
									<p
										id={descriptionId}
										className="mt-0.5 truncate text-xs text-muted-foreground"
									>
										{account.email}
									</p>
								</div>
							</div>
						);
					})}
				</RadioGroup>
			</fieldset>

			<Button
				type="submit"
				className="mt-5 min-h-11 w-full gap-2"
				disabled={!selectedAccount || isContinuing}
			>
				{isContinuing ? (
					<Loader2
						className="size-4 animate-spin motion-reduce:animate-none"
						aria-hidden="true"
					/>
				) : null}
				{isContinuing
					? "Signing in…"
					: selectedAccount
						? `Continue as ${selectedAccount.givenName}`
						: "Choose an account"}
			</Button>
		</form>
	);
}
