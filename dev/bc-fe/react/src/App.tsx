import { useState } from "react";
import "./App.css";
import { auth } from "./lib/auth";

function App() {
	const session = auth.useSession();
	return (
		<>
			<p>Better Auth</p>
			<div>
				{session ? (
					<div
						style={{
							borderRadius: "10px",
							border: "1px solid #4B453F",
							padding: "10px",
							gap: "10px",
						}}
					>
						<p>{session.user.name}</p>
						<p>{session.user.username}</p>
						<p>{session.user.email}</p>
						<div className="flex gap-2">
							{session.user.twoFactorEnabled ? (
								<button
									onClick={async () => {
										await auth.twoFactor.disable();
									}}
								>
									Disable 2FA
								</button>
							) : (
								<button
									onClick={async () => {
										await auth.twoFactor.enable();
									}}
								>
									Enable 2FA
								</button>
							)}

							<button
								onClick={async () => {
									await auth.signOut();
								}}
							>
								Signout
							</button>
						</div>
					</div>
				) : (
					<div>
						<button
							onClick={async () => {
								await auth.signIn.social({
									provider: "github",
								});
							}}
						>
							Continue with github
						</button>
						<SignIn />
						<SignUp />
					</div>
				)}
			</div>
		</>
	);
}

export default App;

function SignUp() {
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: "10px",
				borderRadius: "10px",
				border: "1px solid #4B453F",
				padding: "20px",
				marginTop: "10px",
			}}
		>
			<input
				type="email"
				id="email"
				placeholder="Email"
				style={{
					width: "100%",
				}}
				value={email}
				onChange={(e) => setEmail(e.target.value)}
			/>
			<input
				type="name"
				id="name"
				placeholder="Name"
				style={{
					width: "100%",
				}}
				value={name}
				onChange={(e) => setName(e.target.value)}
			/>
			<input
				type="text"
				id="username"
				placeholder="username"
				style={{
					width: "100%",
				}}
				value={username}
				onChange={(e) => setUsername(e.target.value)}
			/>
			<input
				type="password"
				id="password"
				placeholder="Password"
				style={{
					width: "100%",
				}}
				value={password}
				onChange={(e) => setPassword(e.target.value)}
			/>
			<button
				onClick={async () => {
					await auth.signUp.username({
						email,
						password,
						name,
						username,
					});
				}}
			>
				Sign Up
			</button>
		</div>
	);
}

function SignIn() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: "10px",
				borderRadius: "10px",
				border: "1px solid #4B453F",
				padding: "20px",
				marginTop: "10px",
			}}
		>
			<input
				type="email"
				id="email"
				placeholder="Email"
				style={{
					width: "100%",
				}}
				value={email}
				onChange={(e) => setEmail(e.target.value)}
			/>

			<input
				type="password"
				id="password"
				placeholder="Password"
				style={{
					width: "100%",
				}}
				value={password}
				onChange={(e) => setPassword(e.target.value)}
			/>
			<button
				onClick={async () => {
					await auth.signIn.username({
						username: email,
						password,
						options: {
							onSuccess(context) {
								console.log({
									context,
								});
								if (context.data.twoFactorRedirect) {
									alert("two factor required");
								}
							},
						},
					});
				}}
			>
				Sign In
			</button>
		</div>
	);
}
