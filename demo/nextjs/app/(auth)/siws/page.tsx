"use client";

import {
	ConnectionProvider,
	useWallet,
	WalletProvider,
} from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "../../../lib/auth-client";

function toBase64(bytes: Uint8Array): string {
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
}

const WALLETS = [new PhantomWalletAdapter()];
const RPC = "https://api.mainnet-beta.solana.com";
const PREFERRED_WALLETS = ["Phantom", "Solflare"] as const;

function SiwsContent() {
	const router = useRouter();
	const {
		publicKey,
		signIn,
		signMessage,
		connect,
		connecting,
		connected,
		select,
		wallet,
		wallets,
	} = useWallet();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pendingWalletName, setPendingWalletName] = useState<string | null>(
		null,
	);
	const [shouldSignAfterConnect, setShouldSignAfterConnect] = useState(false);

	const availableWallets = wallets;

	function getPreferredWallet() {
		for (const name of PREFERRED_WALLETS) {
			const match = availableWallets.find(
				({ adapter }) => adapter.name === name,
			);
			if (match) {
				return match;
			}
		}

		return availableWallets[0];
	}

	useEffect(() => {
		if (!pendingWalletName) {
			return;
		}

		if (wallet?.adapter.name !== pendingWalletName || connected || connecting) {
			return;
		}

		void connect()
			.catch((err) => {
				setShouldSignAfterConnect(false);
				setError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => {
				setPendingWalletName(null);
			});
	}, [connect, connected, connecting, pendingWalletName, wallet]);

	function handleWalletSelect(
		name: (typeof wallets)[number]["adapter"]["name"],
	) {
		setError(null);
		setPendingWalletName(String(name));
		select(name);
	}

	async function startSiwsSignIn() {
		if (!publicKey) return;

		setLoading(true);
		try {
			const address = publicKey.toBase58();

			const { data: nonceData, error: nonceErr } = await authClient.siws.nonce({
				address,
			});
			if (nonceErr || !nonceData?.nonce)
				throw new Error(nonceErr?.message ?? "Failed to get nonce");

			const input = {
				domain: window.location.host,
				address,
				statement: "Sign in to Better Auth Demo.",
				nonce: nonceData.nonce,
				issuedAt: new Date().toISOString(),
			};

			let signature: Uint8Array;
			let signedMessage: Uint8Array;

			if (signIn) {
				const out = await signIn(input);
				signature = out.signature;
				signedMessage = out.signedMessage;
			} else if (signMessage) {
				const msg = new TextEncoder().encode(JSON.stringify(input));
				signature = await signMessage(msg);
				signedMessage = msg;
			} else {
				throw new Error("Wallet does not support signing.");
			}

			const { error: verifyErr } = await authClient.siws.verify({
				address,
				input,
				output: {
					account: { address, publicKey: toBase64(publicKey.toBytes()) },
					signature: toBase64(signature),
					signedMessage: toBase64(signedMessage),
				},
			});
			if (verifyErr) throw new Error(verifyErr.message);

			router.push("/dashboard");
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setShouldSignAfterConnect(false);
			setLoading(false);
		}
	}

	useEffect(() => {
		if (
			!shouldSignAfterConnect ||
			!connected ||
			!publicKey ||
			loading ||
			connecting
		) {
			return;
		}

		void startSiwsSignIn();
	}, [connected, connecting, loading, publicKey, shouldSignAfterConnect]);

	async function handleClick() {
		setError(null);

		if (connected) {
			await startSiwsSignIn();
			return;
		}

		setShouldSignAfterConnect(true);

		if (wallet) {
			try {
				await connect();
			} catch (err) {
				setShouldSignAfterConnect(false);
				setError(err instanceof Error ? err.message : String(err));
			}
			return;
		}

		if (availableWallets.length === 0) {
			setShouldSignAfterConnect(false);
			setError(
				"No compatible Solana wallet detected. Install Phantom or Solflare.",
			);
			return;
		}

		const preferredWallet = getPreferredWallet();
		if (!preferredWallet) {
			setShouldSignAfterConnect(false);
			setError(
				"No compatible Solana wallet detected. Install Phantom or Solflare.",
			);
			return;
		}

		handleWalletSelect(preferredWallet.adapter.name);
	}

	const busy = connecting || loading;
	const buttonText = connecting
		? "Connecting..."
		: !connected
			? wallet
				? `Connect ${wallet.adapter.name}`
				: "Connect Wallet"
			: loading
				? "Signing in..."
				: "Sign In With Solana";

	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold tracking-tight">
						Sign In With Solana
					</h1>
					<p className="text-sm text-muted-foreground">
						Connect a Solana wallet to continue.
					</p>
				</div>

				<button
					type="button"
					onClick={handleClick}
					disabled={busy}
					className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 128 128"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<rect width="128" height="128" rx="64" fill="#AB9FF2" />
						<path
							d="M110.584 64.9142H99.142C99.142 41.8668 80.173 23.0713 56.9175 23.0713C33.9379 23.0713 15.1275 41.4924 14.6934 64.1169C14.2453 87.5134 33.807 107 57.3172 107H60.1398C81.2703 107 109.724 91.2015 114.679 71.6912C115.438 68.6447 113.071 64.9142 110.584 64.9142ZM46.7442 67.2898C46.7442 70.1671 44.3757 72.5114 41.4776 72.5114C38.5793 72.5114 36.2109 70.1671 36.2109 67.2898V57.5511C36.2109 54.6739 38.5793 52.3295 41.4776 52.3295C44.3757 52.3295 46.7442 54.6739 46.7442 57.5511V67.2898ZM65.6498 67.2898C65.6498 70.1671 63.2814 72.5114 60.3831 72.5114C57.4851 72.5114 55.1165 70.1671 55.1165 67.2898V57.5511C55.1165 54.6739 57.4851 52.3295 60.3831 52.3295C63.2814 52.3295 65.6498 54.6739 65.6498 57.5511V67.2898Z"
							fill="white"
						/>
					</svg>
					{buttonText}
				</button>

				{error && (
					<p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
						{error}
					</p>
				)}

				<p className="text-center text-xs text-muted-foreground">
					Supports standard wallets like Phantom and Solflare.
				</p>
			</div>
		</div>
	);
}

export default function SiwsPage() {
	return (
		<ConnectionProvider endpoint={RPC}>
			<WalletProvider wallets={WALLETS} autoConnect={false}>
				<SiwsContent />
			</WalletProvider>
		</ConnectionProvider>
	);
}
