"use client";

import { authClient } from "@/lib/authClient";
import { useState } from "react";

export default function Login() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const session = authClient.useSession();
	return (
		<div className="flex flex-col gap-4 p-4">
			{JSON.stringify({ session })}
			<h1 className="font-bold text-2xl">Sign Up</h1>
			<div>
				<p>Name</p>
				<input
					type="text"
					value={name}
					className="border"
					onChange={(e) => setName(e.target.value)}
				/>
			</div>
			<div>
				<p>Email</p>
				<input
					type="text"
					value={email}
					className="border"
					onChange={(e) => setEmail(e.target.value)}
				/>
			</div>
			<div>
				<p>Password</p>
				<input
					type="password"
					value={password}
					className="border"
					onChange={(e) => setPassword(e.target.value)}
				/>
			</div>
			<button
				className="bg-white text-black"
				onClick={async () => {
					const { error } = await authClient.signUp.email({
						email,
						name,
						password,
					});
				}}
			>
				<p>Sign Up</p>
			</button>
			<button
				className="border-white text-whtie"
				onClick={async () => {
					const { error } = await authClient.signOut();
				}}
			>
				<p>Logout</p>
			</button>
		</div>
	);
}
