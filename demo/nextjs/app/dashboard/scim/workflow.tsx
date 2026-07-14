"use client";

import { CheckCircle2, CircleX, Loader2, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "@/components/ui/card";
import type {
	SCIMDemoCheckpoint,
	SCIMDemoStreamEvent,
} from "@/lib/scim-demo-types";

const CHECKPOINT_COUNT = 10;
const CHECKPOINT_IDS: readonly SCIMDemoCheckpoint["id"][] = [
	"discovery",
	"authentication",
	"provision-user",
	"create-group",
	"assign-role",
	"deactivate-user",
	"reactivate-user",
	"delete-user",
	"reprovision-user",
	"cleanup",
];

type WorkflowStatus = "idle" | "running" | "passed" | "failed";

interface WorkflowFailure {
	step: string;
	message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCheckpointId(value: unknown): value is SCIMDemoCheckpoint["id"] {
	return (
		typeof value === "string" &&
		CHECKPOINT_IDS.some((checkpointId) => checkpointId === value)
	);
}

function isCheckpoint(value: unknown): value is SCIMDemoCheckpoint {
	return (
		isRecord(value) &&
		isCheckpointId(value.id) &&
		typeof value.label === "string" &&
		(value.method === "GET" ||
			value.method === "POST" ||
			value.method === "PATCH" ||
			value.method === "DELETE") &&
		typeof value.resource === "string" &&
		typeof value.status === "number" &&
		typeof value.detail === "string" &&
		(value.state === "passed" || value.state === "failed")
	);
}

function parseEvent(line: string): SCIMDemoStreamEvent {
	const value: unknown = JSON.parse(line);
	if (!isRecord(value) || typeof value.type !== "string") {
		throw new Error("The workflow returned an invalid event");
	}
	if (value.type === "checkpoint" && isCheckpoint(value.checkpoint)) {
		return { type: "checkpoint", checkpoint: value.checkpoint };
	}
	if (value.type === "complete") return { type: "complete" };
	if (
		value.type === "error" &&
		isRecord(value.error) &&
		typeof value.error.step === "string" &&
		typeof value.error.message === "string"
	) {
		return {
			type: "error",
			error: { step: value.error.step, message: value.error.message },
		};
	}
	throw new Error("The workflow returned an invalid event");
}

async function readResponseError(response: Response) {
	const body: unknown = await response.json().catch(() => undefined);
	if (isRecord(body) && typeof body.error === "string") return body.error;
	return `The workflow request failed with status ${response.status}`;
}

function addCheckpoint(
	current: SCIMDemoCheckpoint[],
	checkpoint: SCIMDemoCheckpoint,
): SCIMDemoCheckpoint[] {
	const existingIndex = current.findIndex((item) => item.id === checkpoint.id);
	if (existingIndex === -1) {
		return [...current, checkpoint];
	}

	return current.map((item, index) =>
		index === existingIndex ? checkpoint : item,
	);
}

export function SCIMWorkflow() {
	const [status, setStatus] = useState<WorkflowStatus>("idle");
	const [checkpoints, setCheckpoints] = useState<SCIMDemoCheckpoint[]>([]);
	const [failure, setFailure] = useState<WorkflowFailure | null>(null);
	const resultRef = useRef<HTMLDivElement>(null);
	const abortControllerRef = useRef<AbortController | null>(null);

	useEffect(() => {
		return () => abortControllerRef.current?.abort();
	}, []);

	useEffect(() => {
		if (status === "passed" || status === "failed") {
			resultRef.current?.focus();
		}
	}, [status]);

	const runWorkflow = async () => {
		setStatus("running");
		setCheckpoints([]);
		setFailure(null);

		const abortController = new AbortController();
		abortControllerRef.current = abortController;
		let completed = false;
		let failed = false;
		const confirmedCheckpointIds = new Set<string>();

		const handleEvent = (event: SCIMDemoStreamEvent) => {
			if (event.type === "checkpoint") {
				confirmedCheckpointIds.add(event.checkpoint.id);
				setCheckpoints((current) => addCheckpoint(current, event.checkpoint));
				return;
			}

			if (event.type === "complete") {
				completed = true;
				return;
			}

			failed = true;
			setFailure(event.error);
			setStatus("failed");
		};

		const readEvent = (line: string) => {
			const value = line.trim();
			if (!value) return;
			handleEvent(parseEvent(value));
		};

		try {
			const response = await fetch("/api/scim-demo/run", {
				method: "POST",
				headers: { accept: "application/x-ndjson" },
				signal: abortController.signal,
			});
			if (!response.ok) {
				throw new Error(await readResponseError(response));
			}
			if (!response.body) {
				throw new Error("The workflow response didn’t include an event stream");
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				buffer += decoder.decode(value, { stream: !done });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) {
					readEvent(line);
				}
				if (done) break;
			}

			readEvent(buffer);
			if (!completed && !failed) {
				throw new Error("The workflow ended before completion");
			}
			if (
				completed &&
				!failed &&
				confirmedCheckpointIds.size !== CHECKPOINT_COUNT
			) {
				throw new Error(
					`The workflow confirmed ${confirmedCheckpointIds.size} of ${CHECKPOINT_COUNT} checkpoints`,
				);
			}
			if (completed && !failed) {
				setStatus("passed");
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") return;
			setFailure({
				step: "request",
				message:
					error instanceof Error
						? error.message
						: "The workflow request failed",
			});
			setStatus("failed");
		} finally {
			abortControllerRef.current = null;
		}
	};

	return (
		<Card>
			<CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
				<div className="space-y-1.5">
					<h2 className="font-semibold leading-none tracking-tight">
						Workflow checkpoints
					</h2>
					<CardDescription>
						<span className="tabular-nums">
							{checkpoints.length} of {CHECKPOINT_COUNT}
						</span>{" "}
						checkpoints confirmed
					</CardDescription>
				</div>
				<Button
					type="button"
					disabled={status === "running"}
					onClick={runWorkflow}
					className="w-full gap-2 sm:w-auto"
				>
					{status === "running" ? (
						<Loader2
							className="size-4 animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
					) : (
						<Play className="size-4" aria-hidden="true" />
					)}
					{status === "running" ? "Running workflow…" : "Run workflow"}
				</Button>
			</CardHeader>
			<CardContent className="space-y-4">
				<div aria-live="polite" aria-atomic="true">
					{status === "running" && (
						<p className="text-sm text-muted-foreground">Running workflow…</p>
					)}
				</div>

				{checkpoints.length > 0 ? (
					<ol
						className="divide-y border"
						aria-label="SCIM workflow checkpoints"
					>
						{checkpoints.map((checkpoint) => (
							<li
								key={checkpoint.id}
								className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
							>
								<div className="flex min-w-0 items-start gap-3">
									{checkpoint.state === "passed" ? (
										<CheckCircle2
											className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400"
											aria-hidden="true"
										/>
									) : (
										<CircleX
											className="mt-0.5 size-5 shrink-0 text-destructive"
											aria-hidden="true"
										/>
									)}
									<div className="min-w-0 space-y-1">
										<p className="font-medium">{checkpoint.label}</p>
										<p
											className="break-words font-mono text-xs text-muted-foreground"
											translate="no"
										>
											{checkpoint.method} {checkpoint.resource}
										</p>
										<p className="text-sm text-muted-foreground">
											{checkpoint.detail}
										</p>
									</div>
								</div>
								<div className="flex shrink-0 items-center gap-2 pl-8 sm:pl-0">
									<span className="font-mono text-xs tabular-nums">
										{checkpoint.status}
									</span>
									<Badge
										variant={
											checkpoint.state === "failed" ? "destructive" : "outline"
										}
									>
										{checkpoint.state}
									</Badge>
								</div>
							</li>
						))}
					</ol>
				) : (
					<p className="border border-dashed p-6 text-center text-sm text-muted-foreground">
						Run the workflow to inspect each checkpoint
					</p>
				)}

				<div
					ref={resultRef}
					tabIndex={-1}
					className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
				>
					{status === "passed" && (
						<Alert>
							<CheckCircle2 className="size-4" aria-hidden="true" />
							<AlertTitle>SCIM workflow passed</AlertTitle>
							<AlertDescription>
								All {CHECKPOINT_COUNT} server-confirmed states completed
							</AlertDescription>
						</Alert>
					)}
					{status === "failed" && failure && (
						<Alert variant="destructive">
							<CircleX className="size-4" aria-hidden="true" />
							<AlertTitle>SCIM workflow failed at {failure.step}</AlertTitle>
							<AlertDescription>{failure.message}</AlertDescription>
						</Alert>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
