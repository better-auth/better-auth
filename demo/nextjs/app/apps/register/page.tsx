"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { client } from "@/lib/auth-client";

export default function RegisterOAuthClient() {
	const [name, setName] = useState("");
	const [logo, setLogo] = useState<File | null>(null);
	const [redirectUri, setRedirectUri] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);
		setError(null);

		if (!name || !logo || !redirectUri) {
			setError("All fields are required");
			setIsSubmitting(false);
			return;
		}
		const res = await client.oauth2.register({
			name,
			icon: await convertImageToBase64(logo),
			redirectURLs: [redirectUri],
		});
		setIsSubmitting(false);
	};

	return (
		<div className="container mx-auto py-10">
			<Card className="max-w-md mx-auto">
				<CardHeader>
					<CardTitle>Register OAuth Client</CardTitle>
					<CardDescription>
						Provide details to register a new OAuth client as a provider.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Enter client name"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="logo">Logo</Label>
							<Input
								id="logo"
								type="file"
								onChange={(e) => setLogo(e.target.files?.[0] || null)}
								accept="image/*"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="redirectUri">Redirect URI</Label>
							<Input
								id="redirectUri"
								value={redirectUri}
								onChange={(e) => setRedirectUri(e.target.value)}
								placeholder="https://your-app.com/callback"
							/>
						</div>
						{error && (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertTitle>Error</AlertTitle>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<Button type="submit" className="w-full" disabled={isSubmitting}>
							{isSubmitting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Registering...
								</>
							) : (
								"Register Client"
							)}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
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
