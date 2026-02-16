import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import chalk from "chalk";
import { Command } from "commander";

const STORAGE_DIR = path.join(os.homedir(), ".better-auth", "agent-keys");
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
			chalk.gray("  Use --force to regenerate (will break existing connections)."),
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

async function registerAction(url: string, options: { name?: string; scopes?: string }) {
	const keypair = readKeypair();
	if (!keypair) {
		console.log(chalk.red("No keypair found. Run `better-auth agent keygen` first."));
		return;
	}

	const appUrl = url.replace(/\/+$/, "");
	const name = options.name ?? "CLI Agent";
	const scopes = options.scopes ? options.scopes.split(",").map((s) => s.trim()) : [];

	console.log(chalk.blue(`Registering with ${appUrl}...`));

	const res = await fetch(`${appUrl}/api/auth/agent/create`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			name,
			publicKey: keypair.publicKey,
			scopes,
		}),
	});

	if (!res.ok) {
		const err = await res.text();
		console.log(chalk.red(`Failed: ${err}`));
		return;
	}

	const data = (await res.json()) as { agentId: string; scopes: string[] };

	const connections = readConnections();
	const existing = connections.findIndex((c) => c.appUrl === appUrl);
	const connection: StoredConnection = {
		appUrl,
		agentId: data.agentId,
		name,
		scopes: data.scopes,
		connectedAt: new Date().toISOString(),
	};

	if (existing >= 0) {
		connections[existing] = connection;
	} else {
		connections.push(connection);
	}
	writeConnections(connections);

	console.log(chalk.green(`Registered with ${appUrl}.`));
	console.log(chalk.gray(`  Agent ID: ${data.agentId}`));
	console.log(chalk.gray(`  Scopes: ${data.scopes.join(", ") || "none"}`));
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

	console.log(chalk.green(`Removed local connection for ${agentId} (${connection.appUrl}).`));
	console.log(
		chalk.gray("Note: To fully revoke server-side, use the app's agent management UI."),
	);
}

const keygen = new Command("keygen")
	.description("Generate an Ed25519 keypair for agent identity")
	.action(keygenAction);

const register = new Command("register")
	.description("Register this agent's public key with an app")
	.argument("<url>", "App URL (e.g. https://app-x.com)")
	.option("--name <name>", "Friendly name for this agent")
	.option("--scopes <scopes>", "Comma-separated scopes (e.g. email.send,reports.read)")
	.action(registerAction);

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
	.addCommand(register)
	.addCommand(list)
	.addCommand(revoke);
