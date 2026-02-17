import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import chalk from "chalk";
import { Command } from "commander";

const STORAGE_DIR = path.join(os.homedir(), ".better-auth", "agents");
const STORAGE_FILE = path.join(STORAGE_DIR, "keypair.json");
const CONNECTIONS_FILE = path.join(STORAGE_DIR, "connections.json");

interface StoredKeypair {
	privateKey: Record<string, unknown>;
	publicKey: Record<string, unknown>;
	kid: string;
	createdAt: string;
}

interface StoredConnection {
	appUrl: string;
	agentId: string;
	name: string;
	scopes: string[];
	connectedAt: string;
}

function ensureDir() {
	if (!fs.existsSync(STORAGE_DIR)) {
		fs.mkdirSync(STORAGE_DIR, { recursive: true });
	}
}

function readKeypair(): StoredKeypair | null {
	try {
		const data = fs.readFileSync(STORAGE_FILE, "utf-8");
		return JSON.parse(data);
	} catch {
		return null;
	}
}

function writeKeypair(keypair: StoredKeypair) {
	ensureDir();
	fs.writeFileSync(STORAGE_FILE, JSON.stringify(keypair, null, 2), "utf-8");
	fs.chmodSync(STORAGE_FILE, 0o600);
}

function readConnections(): StoredConnection[] {
	try {
		const data = fs.readFileSync(CONNECTIONS_FILE, "utf-8");
		return JSON.parse(data);
	} catch {
		return [];
	}
}

function writeConnections(connections: StoredConnection[]) {
	ensureDir();
	fs.writeFileSync(
		CONNECTIONS_FILE,
		JSON.stringify(connections, null, 2),
		"utf-8",
	);
}

async function keygenAction() {
	const existing = readKeypair();
	if (existing) {
		console.log(chalk.yellow("Keypair already exists."));
		console.log(chalk.gray(`  kid: ${existing.kid}`));
		console.log(chalk.gray(`  Created: ${existing.createdAt}`));
		console.log(chalk.gray(`  Location: ${STORAGE_FILE}`));
		console.log(
			chalk.gray(
				"  Use --force to regenerate (will break existing connections).",
			),
		);
		return;
	}

	const { generateKeypair: generateAgentKeypair } = await import(
		"better-auth/plugins/agent-auth/agent-client"
	);
	const { publicKey, privateKey, kid } = await generateAgentKeypair();

	const keypair: StoredKeypair = {
		privateKey,
		publicKey,
		kid,
		createdAt: new Date().toISOString(),
	};

	writeKeypair(keypair);

	console.log(chalk.green("Keypair generated."));
	console.log(chalk.gray(`  kid: ${kid}`));
	console.log(chalk.gray(`  Stored: ${STORAGE_FILE}`));
	console.log();
	console.log(chalk.bold("Public key (share this with apps):"));
	console.log(chalk.cyan(JSON.stringify(publicKey, null, 2)));
}

async function connectAction(
	url: string,
	options: { name?: string; scopes?: string },
) {
	const appUrl = url.replace(/\/+$/, "");
	const name = options.name ?? "CLI Agent";
	const scopes = options.scopes
		? options.scopes.split(",").map((s) => s.trim())
		: [];

	// Ensure keypair exists
	let keypair = readKeypair();
	if (!keypair) {
		console.log(chalk.blue("No keypair found. Generating one..."));
		const { generateKeypair: generateAgentKeypair } = await import(
			"better-auth/plugins/agent-auth/agent-client"
		);
		const kp = await generateAgentKeypair();
		keypair = {
			...kp,
			createdAt: new Date().toISOString(),
		};
		writeKeypair(keypair);
		console.log(chalk.green(`Keypair generated (kid: ${keypair.kid})`));
	}

	const { connectAgent } = await import(
		"better-auth/plugins/agent-auth/agent-client"
	);

	console.log(chalk.blue(`Connecting to ${appUrl}...`));
	console.log();

	try {
		const result = await connectAgent({
			appURL: appUrl,
			name,
			scopes,
			keypair: {
				publicKey: keypair.publicKey,
				privateKey: keypair.privateKey,
				kid: keypair.kid,
			},
			onUserCode: ({ userCode, verificationUri, verificationUriComplete }) => {
				console.log(chalk.bold("Approve the connection in your browser:"));
				console.log();
				console.log(chalk.cyan(`  ${verificationUriComplete}`));
				console.log();
				console.log(chalk.gray(`Or go to ${verificationUri} and enter code:`));
				console.log(chalk.bold.white(`  ${userCode}`));
				console.log();
				console.log(chalk.gray("Waiting for approval..."));
			},
			onPoll: (attempt) => {
				if (attempt % 6 === 0) {
					console.log(chalk.gray(`  Still waiting... (${attempt * 5}s)`));
				}
			},
		});

		// Save connection locally
		const connections = readConnections();
		const existing = connections.findIndex((c) => c.appUrl === appUrl);
		const connection: StoredConnection = {
			appUrl,
			agentId: result.agentId,
			name: result.name,
			scopes: result.scopes,
			connectedAt: new Date().toISOString(),
		};

		if (existing >= 0) {
			connections[existing] = connection;
		} else {
			connections.push(connection);
		}
		writeConnections(connections);

		console.log();
		console.log(chalk.green("Connected!"));
		console.log(chalk.gray(`  Agent ID: ${result.agentId}`));
		console.log(chalk.gray(`  Scopes: ${result.scopes.join(", ") || "none"}`));
		console.log(chalk.gray(`  App: ${appUrl}`));
	} catch (err) {
		console.log(
			chalk.red(`Failed: ${err instanceof Error ? err.message : String(err)}`),
		);
	}
}

function listAction() {
	const keypair = readKeypair();
	const connections = readConnections();

	if (keypair) {
		console.log(chalk.bold("Keypair:"));
		console.log(chalk.gray(`  kid: ${keypair.kid}`));
		console.log(chalk.gray(`  Created: ${keypair.createdAt}`));
	} else {
		console.log(chalk.yellow("No keypair. Run `better-auth agent keygen`."));
	}

	console.log();

	if (connections.length === 0) {
		console.log(chalk.yellow("No connections."));
		return;
	}

	console.log(chalk.bold(`Connections (${connections.length}):`));
	for (const c of connections) {
		console.log(chalk.white(`  ${c.appUrl}`));
		console.log(chalk.gray(`    Agent: ${c.agentId} (${c.name})`));
		console.log(chalk.gray(`    Scopes: ${c.scopes.join(", ") || "none"}`));
		console.log(chalk.gray(`    Connected: ${c.connectedAt}`));
	}
}

async function revokeAction(agentId: string) {
	const connections = readConnections();
	const connection = connections.find((c) => c.agentId === agentId);

	if (!connection) {
		console.log(chalk.red(`No connection found for agent ${agentId}.`));
		return;
	}

	const updated = connections.filter((c) => c.agentId !== agentId);
	writeConnections(updated);

	console.log(
		chalk.green(
			`Removed local connection for ${agentId} (${connection.appUrl}).`,
		),
	);
	console.log(
		chalk.gray(
			"Note: To fully revoke server-side, use the app's agent management UI.",
		),
	);
}

const keygen = new Command("keygen")
	.description("Generate an Ed25519 keypair for agent identity")
	.action(keygenAction);

const connect = new Command("connect")
	.description(
		"Connect to an app via device authorization (opens browser for approval)",
	)
	.argument("<url>", "App URL (e.g. https://app-x.com)")
	.option("--name <name>", "Friendly name for this agent")
	.option(
		"--scopes <scopes>",
		"Comma-separated scopes (e.g. email.send,reports.read)",
	)
	.action(connectAction);

const list = new Command("list")
	.description("List keypair and all agent connections")
	.action(listAction);

const revoke = new Command("revoke")
	.description("Remove a local agent connection")
	.argument("<agentId>", "Agent ID to remove")
	.action(revokeAction);

export const agent = new Command("agent")
	.description("Manage agent identity and connections")
	.addCommand(keygen)
	.addCommand(connect)
	.addCommand(list)
	.addCommand(revoke);
