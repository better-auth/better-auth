"use client";

import { Check, Copy, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { deleteOAuthProvider } from "./actions";

interface OAuthProvider {
	clientId: string;
	name: string;
	icon: string | null;
	redirectUrls: string;
	type: string;
	disabled: boolean;
	createdAt: Date;
}

interface OAuthProvidersCardProps {
	providers: OAuthProvider[];
}

export function OAuthProvidersCard({ providers }: OAuthProvidersCardProps) {
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();
	const router = useRouter();

	const handleCopyClientId = async (clientId: string) => {
		await navigator.clipboard.writeText(clientId);
		setCopiedId(clientId);
		setTimeout(() => setCopiedId(null), 2000);
	};

	const handleDelete = async (clientId: string, name: string) => {
		setDeletingId(clientId);

		startTransition(async () => {
			const result = await deleteOAuthProvider(clientId);

			if (result.success) {
				toast.success(`OAuth provider "${name}" deleted successfully`);
				router.refresh();
			} else {
				toast.error(result.error || "Failed to delete OAuth provider");
			}

			setDeletingId(null);
		});
	};

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<div>
					<CardTitle>OAuth Providers</CardTitle>
					<CardDescription>
						Manage your registered OAuth applications
					</CardDescription>
				</div>
				<Link href="/apps/register">
					<Button size="sm">
						<Plus className="h-4 w-4 mr-2" />
						Register New Provider
					</Button>
				</Link>
			</CardHeader>
			<CardContent>
				<div className="mb-4 p-4 bg-muted/50 rounded-lg">
					<p className="text-sm text-muted-foreground">
						<strong>Note:</strong> Client secrets are only shown once during
						registration. If you need a new secret, you&apos;ll need to delete
						and re-register your application.
					</p>
				</div>
				{providers.length === 0 ? (
					<div className="text-center py-8 text-muted-foreground">
						<p>No OAuth providers registered yet.</p>
						<Link href="/apps/register">
							<Button variant="link" className="mt-2">
								Register your first provider
							</Button>
						</Link>
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Client ID</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Redirect URLs</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Created</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{providers.map((provider) => (
								<TableRow key={provider.clientId}>
									<TableCell className="font-medium">{provider.name}</TableCell>
									<TableCell>
										<div className="flex flex-col gap-1">
											<div className="flex items-center gap-2">
												<code className="text-xs bg-muted px-2 py-1 rounded">
													{provider.clientId.substring(0, 12)}...
												</code>
												<Button
													variant="ghost"
													size="sm"
													className="h-6 w-6 p-0"
													onClick={() => handleCopyClientId(provider.clientId)}
													title="Copy full Client ID"
												>
													{copiedId === provider.clientId ? (
														<Check className="h-3 w-3 text-green-500" />
													) : (
														<Copy className="h-3 w-3" />
													)}
												</Button>
											</div>
											<span className="text-xs text-muted-foreground">
												Secret cannot be retrieved
											</span>
										</div>
									</TableCell>
									<TableCell className="capitalize">{provider.type}</TableCell>
									<TableCell>
										<div className="text-xs text-muted-foreground max-w-xs truncate">
											{provider.redirectUrls.split(",")[0]}
											{provider.redirectUrls.split(",").length > 1 && (
												<span className="ml-1">
													+{provider.redirectUrls.split(",").length - 1} more
												</span>
											)}
										</div>
									</TableCell>
									<TableCell>
										<span
											className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
												provider.disabled
													? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
													: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
											}`}
										>
											{provider.disabled ? "Disabled" : "Active"}
										</span>
									</TableCell>
									<TableCell className="text-sm text-muted-foreground">
										{new Date(provider.createdAt).toLocaleDateString()}
									</TableCell>
									<TableCell className="text-right">
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													variant="ghost"
													size="sm"
													className="h-8 w-8 p-0"
													disabled={
														deletingId === provider.clientId || isPending
													}
												>
													<Trash2 className="h-4 w-4 text-destructive" />
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>
														Delete OAuth Provider
													</AlertDialogTitle>
													<AlertDialogDescription>
														Are you sure you want to delete &quot;
														{provider.name}
														&quot;? This action cannot be undone and will revoke
														all access tokens for this provider.
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel
														disabled={deletingId === provider.clientId}
													>
														Cancel
													</AlertDialogCancel>
													<AlertDialogAction
														className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
														onClick={() =>
															handleDelete(provider.clientId, provider.name)
														}
														disabled={deletingId === provider.clientId}
													>
														{deletingId === provider.clientId
															? "Deleting..."
															: "Delete"}
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
