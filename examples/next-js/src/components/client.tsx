"use client";

import { authClient } from "@/lib/auth-client";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Dialog, DialogContent, DialogTrigger } from "./ui/dialog";
export function Client() {
	const [uri, setUri] = useState<string>();
	const session = authClient.useSession();
	type S = NonNullable<typeof session>;
	const a: S["user"] = {
		id: "1",
		name: "test",
		email: "test@test.com",
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	useEffect(() => {
		if (session?.user?.twoFactorEnabled) {
			authClient.twoFactor.getTotpUri().then((res) => {
				if (res.data) {
					setUri(res.data.totpURI);
				}
			});
		}
	}, [session]);

	return (
		<Card>
			<CardHeader></CardHeader>
			<CardContent className="flex items-center justify-center gap-2">
				{session ? (
					<div>
						<Button
							onClick={async () => {
								if (session.user?.twoFactorEnabled) {
									await authClient.twoFactor.disable();
								} else {
									await authClient.twoFactor.enable();
								}
							}}
						>
							{session.user?.twoFactorEnabled ? "Disable 2FA" : "Enable 2FA"}
						</Button>
					</div>
				) : null}
				{uri ? (
					<Dialog>
						<DialogTrigger asChild>
							<Button variant="outline">View TOTP URI</Button>
						</DialogTrigger>
						<DialogContent className="flex flex-col items-center justify-center">
							{uri ? (
								<div>
									<p>URI to scan</p>
									<QRCode value={uri} />
								</div>
							) : null}
						</DialogContent>
					</Dialog>
				) : null}
			</CardContent>
		</Card>
	);
}
