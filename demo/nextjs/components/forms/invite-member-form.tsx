"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useInviteMemberMutation } from "@/data/organization/invitation-member-mutation";
import type { OrganizationRole } from "@/lib/auth";

const ORGANIZATION_ROLES = {
	ADMIN: "admin",
	MEMBER: "member",
} as const satisfies Record<string, OrganizationRole>;

const inviteMemberSchema = z.object({
	email: z.email("Please enter a valid email address"),
	role: z.enum(["admin", "member"], {
		error: "Please select a role",
	}),
});

type InviteMemberFormValues = z.infer<typeof inviteMemberSchema>;

interface InviteMemberFormProps {
	onSuccess?: () => void;
	onError?: (error: string) => void;
}

export function InviteMemberForm({
	onSuccess,
	onError,
}: InviteMemberFormProps) {
	const inviteMutation = useInviteMemberMutation();

	const {
		control,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<InviteMemberFormValues>({
		resolver: zodResolver(inviteMemberSchema),
		defaultValues: {
			email: "",
			role: "member",
		},
	});

	const onSubmit = (values: InviteMemberFormValues) => {
		inviteMutation.mutate(
			{
				email: values.email,
				role: values.role as OrganizationRole,
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
					name="email"
					control={control}
					render={({ field }) => (
						<Field>
							<FieldLabel htmlFor="invite-email">Email</FieldLabel>
							<Input
								id="invite-email"
								type="email"
								placeholder="member@example.com"
								disabled={inviteMutation.isPending}
								{...field}
							/>
							<FieldError>{errors.email?.message}</FieldError>
						</Field>
					)}
				/>

				<Controller
					name="role"
					control={control}
					render={({ field }) => (
						<Field>
							<FieldLabel htmlFor="invite-role">Role</FieldLabel>
							<Select
								value={field.value}
								onValueChange={field.onChange}
								disabled={inviteMutation.isPending}
							>
								<SelectTrigger id="invite-role">
									<SelectValue placeholder="Select a role" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ORGANIZATION_ROLES.ADMIN}>
										Admin
									</SelectItem>
									<SelectItem value={ORGANIZATION_ROLES.MEMBER}>
										Member
									</SelectItem>
								</SelectContent>
							</Select>
							<FieldError>{errors.role?.message}</FieldError>
						</Field>
					)}
				/>

				<Button type="submit" disabled={inviteMutation.isPending}>
					{inviteMutation.isPending ? (
						<Loader2 size={15} className="animate-spin" />
					) : (
						"Invite"
					)}
				</Button>
			</FieldGroup>
		</form>
	);
}
