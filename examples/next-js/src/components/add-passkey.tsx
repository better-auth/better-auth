"use client";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { Fingerprint } from "lucide-react";
import { useState } from "react";

export default function AddPasskey() {
	const [isOpen, setIsOpen] = useState(false);
	const [passkeyName, setPasskeyName] = useState("");

	const handleAddPasskey = async () => {
		// This is where you would implement the actual passkey addition logic
		const res = await authClient.passkey.register()
		setIsOpen(false);
		alert("Passkey added successfully. You can now use it to login.");
	};
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">
					<Fingerprint className="mr-2 h-4 w-4" />
					Add Passkey
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Add New Passkey</DialogTitle>
					<DialogDescription>
						Create a new passkey to securely access your account without a
						password.
					</DialogDescription>
				</DialogHeader>

				<DialogFooter>
					<Button type="submit" onClick={handleAddPasskey} className="w-full">
						<Fingerprint className="mr-2 h-4 w-4" />
						Create Passkey
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
