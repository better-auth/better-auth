"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KJUR } from "jsrsasign";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Zod schema for validation
const appleJwtSchema = z.object({
	teamId: z.string().min(1, { message: "Team ID is required." }),
	clientId: z
		.string()
		.min(1, { message: "Client ID (Service ID) is required." }),
	keyId: z.string().min(1, { message: "Key ID is required." }),
	privateKey: z
		.string()
		.min(1, { message: "Private Key content is required." })
		.refine(
			(key) => key.startsWith("-----BEGIN PRIVATE KEY-----"),
			"Private key must be in PKCS#8 PEM format (starting with -----BEGIN PRIVATE KEY-----)",
		)
		.refine(
			(key) => key.includes("-----END PRIVATE KEY-----"),
			"Private key must be in PKCS#8 PEM format (ending with -----END PRIVATE KEY-----)",
		),
});

type AppleJwtFormValues = z.infer<typeof appleJwtSchema>;

export const GenerateAppleJwt = () => {
	const [generatedJwt, setGeneratedJwt] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, startTransition] = useTransition();

	const form = useForm<AppleJwtFormValues>({
		resolver: zodResolver(appleJwtSchema),
		defaultValues: {
			teamId: "",
			clientId: "",
			keyId: "",
			privateKey: "",
		},
	});

	const onSubmit = async (data: AppleJwtFormValues) => {
		setGeneratedJwt(null);
		setError(null);
		startTransition(() => {
			try {
				//normalize the private key by replacing \r\n with \n and trimming whitespace just in-case lol
				const normalizedKey = data.privateKey.replace(/\r\n/g, "\n").trim();

				//since jose is not working with safari, we are using jsrsasign

				const header = {
					alg: "ES256",
					kid: data.keyId,
					typ: "JWT",
				};

				const issuedAtSeconds = Math.floor(Date.now() / 1000);
				/**
				 * Apple allows a maximum expiration of 6 months (180 days) for the client secret JWT.
				 *
				 * @see {@link https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret}
				 */
				const expirationSeconds = issuedAtSeconds + 180 * 24 * 60 * 60; // 180 days. Should we let the user choose this ? MAX is 6 months

				const payload = {
					iss: data.teamId, // Issuer (Team ID)
					aud: "https://appleid.apple.com", // Audience
					sub: data.clientId, // Subject (Client ID -> Service ID)
					iat: issuedAtSeconds, // Issued At timestamp
					exp: expirationSeconds, // Expiration timestamp
				};

				const sHeader = JSON.stringify(header);
				const sPayload = JSON.stringify(payload);

				const jwt = KJUR.jws.JWS.sign(
					"ES256",
					sHeader,
					sPayload,
					normalizedKey,
				);
				setGeneratedJwt(jwt);
			} catch (err: any) {
				console.error("JWT Generation Error:", err);
				setError(
					`Failed to generate JWT: ${
						err.message || "Unknown error"
					}. Check key format and details.`,
				);
			}
		});
	};

	const copyToClipboard = () => {
		if (generatedJwt) {
			navigator.clipboard.writeText(generatedJwt);
		}
	};

	return (
		<div className="my-4 space-y-6">
			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
					<FormField
						control={form.control}
						name="teamId"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Apple Team ID</FormLabel>
								<FormControl>
									<Input placeholder="e.g., A1B2C3D4E5" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="clientId"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Client ID (Service ID)</FormLabel>
								<FormControl>
									<Input placeholder="e.g., com.yourdomain.app" {...field} />
								</FormControl>
								<FormDescription>
									The identifier for the service you created in Apple Developer.
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="keyId"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Key ID</FormLabel>
								<FormControl>
									<Input placeholder="e.g., F6G7H8I9J0" {...field} />
								</FormControl>
								<FormDescription>
									The ID associated with your private key (.p8 file).
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="privateKey"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Private Key Content (.p8 file content)</FormLabel>
								<FormControl>
									<Textarea
										placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
										className="min-h-[150px] font-mono text-sm"
										{...field}
									/>
								</FormControl>
								<FormDescription>
									Paste the entire content of your .p8 private key file here.
									Ensure it's in PKCS#8 format.
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" disabled={isLoading}>
						{isLoading ? "Generating..." : "Generate Apple Client Secret (JWT)"}
					</Button>
				</form>
			</Form>

			{error && (
				<div className="mt-4 rounded-md border border-red-400 bg-red-50 p-3 text-red-700">
					<p className="font-semibold">Error:</p>
					<p className="text-sm">{error}</p>
				</div>
			)}

			{generatedJwt && (
				<div className="mt-6 space-y-2">
					<h3 className="text-lg font-semibold">Generated Client Secret:</h3>
					<div className="relative rounded-md bg-muted p-4 font-mono text-sm">
						<pre className="overflow-x-auto whitespace-pre-wrap break-all">
							<code>{generatedJwt}</code>
						</pre>
						<Button
							variant="ghost"
							size="icon"
							className="absolute right-2 top-2 h-7 w-7"
							onClick={copyToClipboard}
							title="Copy to clipboard"
						>
							{/* I used gpt for this lol. Should we change to another icon or is this ok ? */}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="lucide lucide-copy"
							>
								<rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
								<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
							</svg>
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						This is the client secret (JWT) required for 'Sign in with Apple'.
						It expires in 180 days.
					</p>
				</div>
			)}
		</div>
	);
};
