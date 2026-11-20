import { execFileSync } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

// The developer variant of chrome://flags/#enable-standard-device-bound-session-credentials,
// plus software keys so it runs without a TPM.
const FEATURES = [
	"DeviceBoundSessions:RequireOriginTrialTokens/false/RefreshQuota/false/CheckSubdomainRegistration/false",
	"EnableBoundSessionCredentialsSoftwareKeysForManualTesting",
	"UseUnexportableKeyServiceInBrowserProcess",
];

export const CHANNEL = process.env.DBSC_PROBE_CHANNEL ?? "chromium";

export async function launch(spkiHash: string) {
	return chromium.launch({
		channel: CHANNEL,
		args: [
			`--enable-features=${FEATURES.join(",")}`,
			`--ignore-certificate-errors-spki-list=${spkiHash}`,
		],
	});
}

export function createCertificate() {
	const dir = mkdtempSync(path.join(tmpdir(), "dbsc-probe-"));
	const keyPath = path.join(dir, "key.pem");
	const certPath = path.join(dir, "cert.pem");
	execFileSync(
		"openssl",
		[
			"req",
			"-x509",
			"-newkey",
			"ec",
			"-pkeyopt",
			"ec_paramgen_curve:P-256",
			"-nodes",
			"-days",
			"1",
			"-subj",
			"/CN=localhost",
			"-addext",
			"subjectAltName=DNS:localhost,IP:127.0.0.1",
			"-keyout",
			keyPath,
			"-out",
			certPath,
		],
		{ stdio: "ignore" },
	);
	const cert = readFileSync(certPath);
	const key = readFileSync(keyPath);
	rmSync(dir, { recursive: true, force: true });
	// Chrome only processes DBSC headers over valid TLS, so the browser is
	// told to trust this throwaway certificate by its SPKI hash.
	const spkiHash = createHash("sha256")
		.update(
			new X509Certificate(cert).publicKey.export({
				format: "der",
				type: "spki",
			}),
		)
		.digest("base64");
	return { cert, key, spkiHash };
}
