"use client";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { signUp, signIn } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState, useEffect, ChangeEvent } from "react";
import { z } from "zod";
import { DiscordLogoIcon, GitHubLogoIcon } from "@radix-ui/react-icons";
import { Loader2, X } from "lucide-react";
const signUpSchema = z
	.object({
		firstName: z.string().min(1, "First name is required"),
		lastName: z.string().min(1, "Last name is required"),
		email: z.string().email("Invalid email address"),
		image: z
			.instanceof(File)
			.optional()
			.refine((file) => !file || file.type.startsWith("image/"), {
				message: "Invalid file type. Only images are allowed.",
				path: ["image"],
			}),
		password: z.string().min(6, "Password must be at least 6 characters"),
		passwordConfirmation: z
			.string()
			.min(6, "Password must be at least 6 characters"),
	})

	.refine((data) => data.password === data.passwordConfirmation, {
		message: "Passwords do not match",
		path: ["passwordConfirmation"],
	});

type FormDataType = z.infer<typeof signUpSchema>;

type ErrorsType = Partial<Record<keyof FormDataType, string>>;

type TouchedType = Partial<Record<keyof FormDataType, boolean>>;

export function SignUp() {
	const [formData, setFormData] = useState<FormDataType>({
		firstName: "",
		lastName: "",
		email: "",
		password: "",
		image: undefined,
		passwordConfirmation: "",
	});
	const [errors, setErrors] = useState<ErrorsType>({});
	const [isValid, setIsValid] = useState(false);
	const [touched, setTouched] = useState<TouchedType>({});
	const [loading, setLoading] = useState(false);
	const [image, setImage] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const router = useRouter();

	useEffect(() => {
		const validationResult = signUpSchema.safeParse(formData);
		if (!validationResult.success) {
			const newErrors: ErrorsType = {};
			validationResult.error.errors.forEach((err) => {
				if (err.path[0])
					newErrors[err.path[0] as keyof FormDataType] = err.message;
			});
			setErrors(newErrors);
			setIsValid(false);
		} else {
			setErrors({});
			setIsValid(true);
		}
	}, [formData]);

	const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
		const { id, value } = e.target;
		setFormData((prev) => ({ ...prev, [id]: value }));
		setTouched((prev) => ({ ...prev, [id]: true }));
	};
	const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0] || null;
		setImage(file);
		setFormData((prev) => ({ ...prev, image: file || undefined }));
		if (file) {
			const reader = new FileReader();
			reader.onload = () => setImagePreview(reader.result as string);
			reader.readAsDataURL(file);
		} else {
			setImagePreview(null);
		}
	};
	return (
		<Card className="z-50 rounded-md rounded-t-none max-w-md">
			<CardHeader>
				<CardTitle className="text-lg md:text-xl">Sign Up</CardTitle>
				<CardDescription className="text-xs md:text-sm">
					Enter your information to create an account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4">
					<div className="grid grid-cols-2 gap-4">
						<div className="grid gap-2">
							<Label htmlFor="firstName">First name</Label>
							<Input
								id="firstName"
								placeholder="Max"
								value={formData.firstName}
								onChange={handleChange}
							/>
							{touched.firstName && errors.firstName && (
								<p className="text-red-500 text-sm">{errors.firstName}</p>
							)}
						</div>
						<div className="grid gap-2">
							<Label htmlFor="lastName">Last name</Label>
							<Input
								id="lastName"
								placeholder="Robinson"
								value={formData.lastName}
								onChange={handleChange}
							/>
							{touched.lastName && errors.lastName && (
								<p className="text-red-500 text-sm">{errors.lastName}</p>
							)}
						</div>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							placeholder="m@example.com"
							value={formData.email}
							onChange={handleChange}
						/>
						{touched.email && errors.email && (
							<p className="text-red-500 text-sm">{errors.email}</p>
						)}
					</div>
					<div className="grid gap-2">
						<Label htmlFor="password">Password</Label>
						<PasswordInput
							id="password"
							value={formData.password}
							onChange={handleChange}
							placeholder="Password"
						/>
						{touched.password && errors.password && (
							<p className="text-red-500 text-sm">{errors.password}</p>
						)}
					</div>
					<div className="grid gap-2">
						<Label htmlFor="passwordConfirmation">Confirm Password</Label>
						<PasswordInput
							id="passwordConfirmation"
							value={formData.passwordConfirmation}
							onChange={handleChange}
							placeholder="Confirm Password"
						/>
						{touched.passwordConfirmation && errors.passwordConfirmation && (
							<p className="text-red-500 text-sm">
								{errors.passwordConfirmation}
							</p>
						)}
					</div>
					<div className="grid gap-2">
						<Label htmlFor="image">Profile Image (optional)</Label>
						<div className="flex items-end gap-4">
							{imagePreview && (
								<div className="relative w-16 h-16 rounded-sm overflow-hidden">
									<Image
										src={imagePreview}
										alt="Profile preview"
										layout="fill"
										objectFit="cover"
									/>
								</div>
							)}
							<Input
								id="image"
								type="file"
								accept="image/*"
								onChange={handleImageChange}
								className="w-full"
							/>
							{imagePreview && (
								<X
									className="cursor-pointer"
									onClick={() => {
										setImage(null);
										setImagePreview(null);
									}}
								/>
							)}
						</div>
					</div>
					<Button
						className="w-full"
						disabled={!isValid || loading}
						onClick={async () => {
							setLoading(true);
							await signUp.email({
								email: formData.email,
								password: formData.password,
								name: `${formData.firstName} ${formData.lastName}`,
								image: formData.image
									? await convertImageToBase64(formData.image)
									: "",
								callbackURL: "/dashboard",
								fetchOptions: {
									onResponse: () => {
										setLoading(false);
									},
									onRequest: () => {
										setLoading(true);
									},
									onError: (ctx) => {
										toast.error(ctx.error.message);
									},
									onSuccess: async () => {
										router.push("/dashboard");
									},
								},
							});
							setLoading(false);
							router.push("/dashboard");
						}}
					>
						{loading ? (
							<Loader2 size={16} className="animate-spin" />
						) : (
							"Create an account"
						)}
					</Button>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							className="w-full gap-2"
							onClick={async () => {
								await signIn.social({
									provider: "github",
									callbackURL: "/dashboard",
								});
							}}
						>
							<GitHubLogoIcon />
						</Button>
						<Button
							variant="outline"
							className="w-full gap-2"
							onClick={async () => {
								await signIn.social({
									provider: "discord",
									callbackURL: "/dashboard",
								});
							}}
						>
							<DiscordLogoIcon />
						</Button>
						<Button
							variant="outline"
							className="w-full gap-2"
							onClick={async () => {
								await signIn.social({
									provider: "google",
									callbackURL: "/dashboard",
								});
							}}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="0.98em"
								height="1em"
								viewBox="0 0 256 262"
							>
								<path
									fill="#4285F4"
									d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
								/>
								<path
									fill="#34A853"
									d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
								/>
								<path
									fill="#FBBC05"
									d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"
								/>
								<path
									fill="#EB4335"
									d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
								/>
							</svg>
						</Button>
						<Button
							variant="outline"
							className="w-full gap-2"
							onClick={async () => {
								await signIn.social({
									provider: "microsoft",
									callbackURL: "/dashboard",
								});
							}}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="1.2em"
								height="1.2em"
								viewBox="0 0 24 24"
							>
								<path
									fill="currentColor"
									d="M2 3h9v9H2zm9 19H2v-9h9zM21 3v9h-9V3zm0 19h-9v-9h9z"
								></path>
							</svg>
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
async function convertImageToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}
