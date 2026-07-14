export type SCIMDemoCheckpointId =
	| "discovery"
	| "authentication"
	| "provision-user"
	| "create-group"
	| "assign-role"
	| "deactivate-user"
	| "reactivate-user"
	| "delete-user"
	| "reprovision-user"
	| "cleanup";

export interface SCIMDemoCheckpoint {
	id: SCIMDemoCheckpointId;
	label: string;
	method: "GET" | "POST" | "PATCH" | "DELETE";
	resource: string;
	status: number;
	detail: string;
	state: "passed" | "failed";
}

export type SCIMDemoStreamEvent =
	| { type: "checkpoint"; checkpoint: SCIMDemoCheckpoint }
	| { type: "complete" }
	| {
			type: "error";
			error: {
				step: string;
				message: string;
			};
	  };
