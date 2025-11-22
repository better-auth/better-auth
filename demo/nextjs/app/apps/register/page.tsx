"use client";

import { AlertCircle, Check, Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { client } from "@/lib/auth-client";

interface Credentials {
	clientId: string;
	clientSecret: string;
}

export default function RegisterOAuthClient() {
	const [name, setName] = useState("");
	const [logo, setLogo] = useState<File | null>(null);
	const [redirectUri, setRedirectUri] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [credentials, setCredentials] = useState<Credentials | null>(null);
	const [copiedField, setCopiedField] = useState<string | null>(null);
	const router = useRouter();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);
		setError(null);

		if (!name || !redirectUri) {
			setError("Name and Redirect URI are required");
			setIsSubmitting(false);
			return;
		}

		try {
			const res = await client.oauth2.register({
				client_name: name,
				redirect_uris: [redirectUri],
				logo_uri: logo ? await convertImageToBase64(logo) : undefined,
				grant_types: ["authorization_code", "refresh_token"],
			});

			if (res.data) {
				// Registration successful - show credentials
				setCredentials({
					clientId: res.data.client_id,
					clientSecret: res.data.client_secret!,
				});
			} else if (res.error) {
				setError(res.error.message || "Registration failed");
			}
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "An unexpected error occurred",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleCopy = async (text: string, field: string) => {
		await navigator.clipboard.writeText(text);
		setCopiedField(field);
		setTimeout(() => setCopiedField(null), 2000);
	};

	const handleDone = () => {
		router.push("/dashboard");
	};

	// Show credentials after successful registration
	if (credentials) {
		return (
			<div className="container mx-auto py-10">
				<Card className="max-w-2xl mx-auto">
					<CardHeader>
						<CardTitle className="text-green-600">
							OAuth Client Registered Successfully!
						</CardTitle>
						<CardDescription>
							Save these credentials securely. The client secret will not be
							shown again.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<Alert>
							<AlertCircle className="h-4 w-4" />
							<AlertTitle>Important</AlertTitle>
							<AlertDescription>
								Make sure to copy your client secret now. You won&apos;t be able
								to see it again for security reasons.
							</AlertDescription>
						</Alert>

						<div className="space-y-4">
							<div className="space-y-2">
								<Label>Client ID</Label>
								<div className="flex items-center gap-2">
									<Input
										value={credentials.clientId}
										readOnly
										className="font-mono"
									/>
									<Button
										variant="outline"
										size="icon"
										onClick={() => handleCopy(credentials.clientId, "clientId")}
									>
										{copiedField === "clientId" ? (
											<Check className="h-4 w-4 text-green-500" />
										) : (
											<Copy className="h-4 w-4" />
										)}
									</Button>
								</div>
							</div>

							<div className="space-y-2">
								<Label>Client Secret</Label>
								<div className="flex items-center gap-2">
									<Input
										value={credentials.clientSecret}
										readOnly
										className="font-mono"
										type="password"
									/>
									<Button
										variant="outline"
										size="icon"
										onClick={() =>
											handleCopy(credentials.clientSecret, "clientSecret")
										}
									>
										{copiedField === "clientSecret" ? (
											<Check className="h-4 w-4 text-green-500" />
										) : (
											<Copy className="h-4 w-4" />
										)}
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">
									This secret is hidden. Click the copy button to copy it to
									your clipboard.
								</p>
							</div>
						</div>

						<div className="pt-4">
							<Button onClick={handleDone} className="w-full">
								Go to Dashboard
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

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
							<Label htmlFor="name">Name *</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Enter client name"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="logo">Logo (Optional)</Label>
							<Input
								id="logo"
								type="file"
								onChange={(e) => setLogo(e.target.files?.[0] || null)}
								accept="image/*"
							/>
							<p className="text-xs text-muted-foreground">
								Upload a logo for your OAuth application
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="redirectUri">Redirect URI *</Label>
							<Input
								id="redirectUri"
								value={redirectUri}
								onChange={(e) => setRedirectUri(e.target.value)}
								placeholder="https://your-app.com/callback"
								required
							/>
							<p className="text-xs text-muted-foreground">
								The URL where users will be redirected after authorization
							</p>
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
