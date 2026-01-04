"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, X } from "lucide-react";
import Image from "next/image";
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
import { useUpdateUserMutation } from "@/data/user/update-user-mutation";
import { useImagePreview } from "@/hooks/use-image-preview";
import { convertImageToBase64 } from "@/lib/utils";

const updateUserSchema = z.object({
	name: z
		.string()
		.min(2, "Name must be at least 2 characters")
		.max(50, "Name must be at most 50 characters")
		.optional()
		.or(z.literal("")),
});

type UpdateUserFormValues = z.infer<typeof updateUserSchema>;

interface UpdateUserFormProps {
	currentName?: string;
	onSuccess?: () => void;
	onError?: (error: string) => void;
}

export function UpdateUserForm({
	currentName,
	onSuccess,
	onError,
}: UpdateUserFormProps) {
	const updateUserMutation = useUpdateUserMutation();
	const { image, imagePreview, handleImageChange, clearImage } =
		useImagePreview();

	const {
		control,
		handleSubmit,
		reset,
		watch,
		formState: { errors },
	} = useForm<UpdateUserFormValues>({
		resolver: zodResolver(updateUserSchema),
		defaultValues: {
			name: "",
		},
	});

	const onSubmit = async (values: UpdateUserFormValues) => {
		try {
			const imageBase64 = image ? await convertImageToBase64(image) : undefined;

			updateUserMutation.mutate(
				{
					image: imageBase64,
					name: values.name || undefined,
				},
				{
					onSuccess: () => {
						reset();
						clearImage();
						onSuccess?.();
					},
					onError: (error) => {
						onError?.(error.message);
					},
				},
			);
		} catch (error) {
			onError?.(
				error instanceof Error ? error.message : "Failed to process image",
			);
		}
	};

	const nameValue = watch("name");

	return (
		<form onSubmit={handleSubmit(onSubmit)}>
			<FieldGroup>
				<Controller
					name="name"
					control={control}
					render={({ field }) => (
						<Field>
							<FieldLabel htmlFor="name">Full Name</FieldLabel>
							<Input
								id="name"
								type="text"
								placeholder={currentName}
								disabled={updateUserMutation.isPending}
								{...field}
							/>
							<FieldError>{errors.name?.message}</FieldError>
						</Field>
					)}
				/>

				<Field>
					<FieldLabel htmlFor="image">Profile Image</FieldLabel>
					<div className="flex items-end gap-4">
						{imagePreview && (
							<div className="relative w-16 h-16 rounded-sm overflow-hidden">
								<Image
									src={imagePreview}
									alt="Profile preview"
									fill
									className="object-cover"
								/>
							</div>
						)}
						<div className="flex items-center gap-2 w-full">
							<Input
								id="image"
								type="file"
								accept="image/*"
								onChange={handleImageChange}
								disabled={updateUserMutation.isPending}
								className="w-full text-muted-foreground"
							/>
							{imagePreview && (
								<X
									className="cursor-pointer"
									onClick={clearImage}
									aria-label="Clear image"
								/>
							)}
						</div>
					</div>
				</Field>

				<Button
					type="submit"
					disabled={updateUserMutation.isPending || (!image && !nameValue)}
				>
					{updateUserMutation.isPending ? (
						<Loader2 size={15} className="animate-spin" />
					) : (
						"Update"
					)}
				</Button>
			</FieldGroup>
		</form>
	);
}
