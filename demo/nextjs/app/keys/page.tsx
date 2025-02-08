"use client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { client } from "@/lib/auth-client";
import { CalendarIcon, Loader2, Plus, ShieldCheck } from "lucide-react";
import { toast, Toaster } from "sonner";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ApiKey } from "better-auth/plugins";

export default function Page() {
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isLoading, setIsLoading] = useState<string | undefined>(undefined);

	const { data: keys, isLoading: isKeysLoading } = useQuery({
		queryKey: ["keys"],
		queryFn: async () => {
			const data = await client.apiKey.list({
				query: { reference: "demo-app" },
			});
			return data?.data || [];
		},
	});

	const handleDeleteUser = async (id: string) => {};

	const handleRevokeSessions = async (id: string) => {};

	const handleImpersonateUser = async (id: string) => {};

	return (
		<div className="container p-4 mx-auto space-y-8">
			<Toaster richColors />

			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle className="text-2xl">API Keys</CardTitle>
					<div className="flex gap-3">
						<CreateKeyForm isLoading={isLoading} setIsLoading={setIsLoading} />
						<VerifyKeyForm isLoading={isLoading} setIsLoading={setIsLoading} />
					</div>
				</CardHeader>
				<CardContent>
					{isKeysLoading ? (
						<div className="flex items-center justify-center h-64">
							<Loader2 className="w-8 h-8 animate-spin" />
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Remaining</TableHead>
									<TableHead>Expires</TableHead>
									<TableHead>Enabled</TableHead>
									<TableHead>Last Verified At</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{keys
									?.filter((x) => x.success)
									.map(({ apiKey }) => {
										const key = apiKey as ApiKey;
										return (
											<TableRow key={key.id}>
												<TableCell>{key.name}</TableCell>
												<TableCell>{key.remaining ?? "Unlimited"}</TableCell>
												<TableCell>
													{key.expires
														? format(new Date(key.expires), "PPP")
														: "-"}
												</TableCell>
												<TableCell>{key.enabled ? "Yes" : "No"}</TableCell>
												<TableCell>
													{key.lastVerifiedAt
														? format(key.lastVerifiedAt, "PPPp")
														: "-"}
												</TableCell>
												{/* <TableCell>
											{user.banned ? (
												<Badge variant="destructive">Yes</Badge>
											) : (
												<Badge variant="outline">No</Badge>
											)}
										</TableCell>
										<TableCell>
											<div className="flex space-x-2">
												<Button
													variant="destructive"
													size="sm"
													onClick={() => handleDeleteUser(user.id)}
													disabled={isLoading?.startsWith("delete")}
												>
													{isLoading === `delete-${user.id}` ? (
														<Loader2 className="w-4 h-4 animate-spin" />
													) : (
														<Trash className="w-4 h-4" />
													)}
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => handleRevokeSessions(user.id)}
													disabled={isLoading?.startsWith("revoke")}
												>
													{isLoading === `revoke-${user.id}` ? (
														<Loader2 className="w-4 h-4 animate-spin" />
													) : (
														<RefreshCw className="w-4 h-4" />
													)}
												</Button>
												<Button
													variant="secondary"
													size="sm"
													onClick={() => handleImpersonateUser(user.id)}
													disabled={isLoading?.startsWith("impersonate")}
												>
													{isLoading === `impersonate-${user.id}` ? (
														<Loader2 className="w-4 h-4 animate-spin" />
													) : (
														<>
															<UserCircle className="w-4 h-4 mr-2" />
															Impersonate
														</>
													)}
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={async () => {
														setBanForm({
															userId: user.id,
															reason: "",
															expirationDate: undefined,
														});
														if (user.banned) {
															setIsLoading(`ban-${user.id}`);
															await client.admin.unbanUser(
																{
																	userId: user.id,
																},
																{
																	onError(context) {
																		toast.error(
																			context.error.message ||
																				"Failed to unban user",
																		);
																		setIsLoading(undefined);
																	},
																	onSuccess() {
																		queryClient.invalidateQueries({
																			queryKey: ["users"],
																		});
																		toast.success("User unbanned successfully");
																	},
																},
															);
															queryClient.invalidateQueries({
																queryKey: ["users"],
															});
														} else {
															setIsBanDialogOpen(true);
														}
													}}
													disabled={isLoading?.startsWith("ban")}
												>
													{isLoading === `ban-${user.id}` ? (
														<Loader2 className="w-4 h-4 animate-spin" />
													) : user.banned ? (
														"Unban"
													) : (
														"Ban"
													)}
												</Button>
											</div>
										</TableCell> */}
											</TableRow>
										);
									})}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function CreateKeyForm({
	isLoading,
	setIsLoading,
}: {
	isLoading: string | undefined;
	setIsLoading: React.Dispatch<React.SetStateAction<string | undefined>>;
}) {
	const queryClient = useQueryClient();
	const [menu, setMenu] = useState<"form" | "complete">("form");
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [newKey, setNewKey] = useState<{
		name: string;
		remaining: number | undefined;
		prefix: string;
		length: number;
		expires: number | undefined;
		enabled: boolean;
		rateLimit: {
			enabled: boolean;
			timeWindow: number;
			limit: number;
		};
	}>({
		name: "",
		remaining: undefined,
		prefix: "",
		length: 64,
		expires: undefined,
		enabled: true,
		rateLimit: {
			enabled: true,
			timeWindow: 1000 * 30,
			limit: 10,
		},
	});
	const [apiKeyResult, setApiKeyResult] = useState<string>("");

	const handleCreateKey = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading("create");
		const res = await client.apiKey.create({
			name: newKey.name,
			reference: "demo-app",
			remaining: newKey.remaining,
			prefix: newKey.prefix === "" ? undefined : newKey.prefix,
			length: newKey.length,
			expires: newKey.expires,
			enabled: newKey.enabled,
			rateLimit: {
				enabled: newKey.rateLimit.enabled,
				timeWindow: newKey.rateLimit.timeWindow,
				limit: newKey.rateLimit.limit,
			},
		});
		if (res.data) {
			console.log(res.data);
			toast.success("API Key created successfully");
			queryClient.invalidateQueries({
				queryKey: ["keys"],
			});
			setIsLoading(undefined);
			setApiKeyResult(res.data.key);
			setMenu("complete");
		} else {
			console.log(res.error);
			setApiKeyResult("");
			toast.error(`Failed to create API Key: ${res.error.message}`);
			setIsLoading(undefined);
		}
	};

	useEffect(() => {
		if (!isDialogOpen) {
			setTimeout(() => {
				setMenu("form");
			}, 100);
		}
	}, [isDialogOpen]);

	const formUI = (
		<form onSubmit={handleCreateKey} className="space-y-4">
			<div>
				<div className="flex items-center h-8 gap-2">
					<Label htmlFor="name">Name*</Label>
				</div>
				<p className="h-8 text-sm text-muted-foreground">
					The name of the API key.
				</p>
				<Input
					id="name"
					value={newKey.name}
					onChange={(e) => setNewKey((x) => ({ ...x, name: e.target.value }))}
					required
				/>
			</div>
			<div>
				<div className="flex items-center h-8 gap-2">
					<Label htmlFor="length">Key Length</Label>
				</div>
				<p className="h-8 text-sm text-muted-foreground">
					The length of the API key.
				</p>
				<Input
					type="number"
					id="length"
					value={newKey.length}
					onChange={(e) =>
						setNewKey((x) => ({
							...x,
							length: parseInt(e.target.value),
						}))
					}
				/>
			</div>
			<div>
				<div className="flex items-center h-8 gap-2">
					<Label htmlFor="prefix">Key Prefix</Label>
				</div>
				<p className="h-8 text-sm text-muted-foreground">
					A prefix to your API Key.
				</p>
				<Input
					value={newKey.prefix}
					id="prefix"
					onChange={(e) => setNewKey((x) => ({ ...x, prefix: e.target.value }))}
				/>
			</div>

			<div>
				<div className="flex items-center h-8 gap-2">
					<Label htmlFor="remaining">Remaining</Label>
					<Checkbox
						id="remaining"
						checked={newKey.remaining !== undefined}
						onCheckedChange={(checked) => {
							setNewKey((x) => ({
								...x,
								remaining: checked ? 10 : undefined,
							}));
						}}
					/>
				</div>
				<p className="h-8 text-sm text-muted-foreground">
					The number of times this key can be used.
				</p>

				{newKey.remaining === undefined ? (
					<Input value="Unlimited" disabled />
				) : (
					<Input
						type="number"
						value={newKey.remaining ?? 10}
						onChange={(e) =>
							setNewKey((x) => ({
								...x,
								remaining: parseInt(e.target.value),
							}))
						}
					/>
				)}
			</div>
			<div>
				<div className="flex items-center h-8 gap-2">
					<Label htmlFor="expires">Expires</Label>
					<Checkbox
						id="expires"
						checked={newKey.expires !== undefined}
						onCheckedChange={(checked) => {
							setNewKey((x) => ({
								...x,
								expires: checked
									? new Date().getTime() + 1000 * 60 * 60 * 24
									: undefined,
							}));
						}}
					/>
				</div>
				<p className="h-8 text-sm text-muted-foreground">
					The date when the API key expires.
				</p>
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant={"outline"}
							className={cn(
								"w-[240px] pl-3 text-left font-normal",
								!newKey.expires && "text-muted-foreground",
							)}
							disabled={!newKey.expires}
						>
							{newKey.expires ? (
								format(newKey.expires, "PPP")
							) : (
								<span>Pick a date</span>
							)}
							<CalendarIcon className="w-4 h-4 ml-auto opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-auto p-0" align="start">
						<Calendar
							mode="single"
							disabled={(date) => date < new Date()}
							selected={
								newKey.expires === undefined
									? new Date()
									: new Date(newKey.expires)
							}
							onSelect={(date) => {
								if (date) {
									setNewKey((x) => ({
										...x,
										expires: date.getTime(),
									}));
								}
							}}
							initialFocus
						/>
					</PopoverContent>
				</Popover>
			</div>
			<div className="h-2"></div>
			<Button
				type="submit"
				className="w-full"
				disabled={isLoading === "create"}
			>
				{isLoading === "create" ? (
					<>
						<Loader2 className="w-4 h-4 mr-2 animate-spin" />
						Creating...
					</>
				) : (
					"Create API Key"
				)}
			</Button>
		</form>
	);

	const completeUI = (
		<div className="flex flex-col items-center justify-center px-10 space-y-4 ">
			<Input
				value={apiKeyResult}
				spellCheck={false}
				readOnly
				className="mt-5"
			/>
			<Button
				onClick={async () => {
					try {
						await navigator.clipboard.writeText(apiKeyResult);
						toast.success("Copied to clipboard");
					} catch (error) {
						console.log(error);
						toast.error("Failed to copy to clipboard");
					}
				}}
			>
				Copy Key to Clipboard
			</Button>
		</div>
	);

	return (
		<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
			<DialogTrigger asChild>
				<Button>
					<Plus className="w-4 h-4 mr-2" /> Create Key
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{menu === "form"
							? "Create New API Key"
							: "API Key Created Successfully! 🎉"}
					</DialogTitle>
				</DialogHeader>
				{menu === "form" ? formUI : completeUI}
			</DialogContent>
		</Dialog>
	);
}

function VerifyKeyForm({
	isLoading,
	setIsLoading,
}: {
	isLoading: string | undefined;
	setIsLoading: React.Dispatch<React.SetStateAction<string | undefined>>;
}) {
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [apiKey, setApiKey] = useState<string>("");

	const handleVerifyAPIKey = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading("verify");
		const res = await client.apiKey.verify({
			key: apiKey,
		});
		if (res.data?.valid === true) {
			console.log(res.data);
			toast.success("API Key is Valid");
			setIsLoading(undefined);
			// setIsDialogOpen(false);
		} else {
			console.log(res.error);
			toast.error(
				`Invalid API Key${res.error?.message ? `: ${res.error.message}` : ""}`,
			);
			setIsLoading(undefined);
		}
	};

	return (
		<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
			<DialogTrigger asChild>
				<Button>
					<ShieldCheck className="w-4 h-4 mr-2" /> Verify Key
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Verify API Key</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleVerifyAPIKey} className="space-y-4">
					<div>
						<div className="flex items-center h-8 gap-2">
							<Label htmlFor="apiKey">API Key*</Label>
						</div>
						<p className="h-8 text-sm text-muted-foreground">
							Your API Key which you want to verify.
						</p>
						<Input
							id="apiKey"
							value={apiKey}
							onChange={(e) => setApiKey((x) => e.target.value)}
							required
						/>
					</div>

					<div className="h-2"></div>
					<Button
						type="submit"
						className="w-full"
						disabled={isLoading === "verify"}
					>
						{isLoading === "verify" ? (
							<>
								<Loader2 className="w-4 h-4 mr-2 animate-spin" />
								Verifying...
							</>
						) : (
							"Test Verify Key"
						)}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
