"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { codeToHtml } from "shiki";
import { authClient } from "@/lib/auth-client";

const pages = [
	{ href: "/auth/sign-in", label: "Sign in" },
	{ href: "/auth/sign-up", label: "Sign up" },
	{ href: "/auth/forgot-password", label: "Forgot password" },
	{ href: "/auth/reset-password", label: "Reset password" },
	{ href: "/auth/verify-email", label: "Verify email" },
	{ href: "/auth/error?error=demo_error", label: "Error" },
];

function UserCard() {
	const session = authClient.useSession();

	if (session.isPending) {
		return (
			<div className="user-card">
				<div className="user-card-body">
					<div className="user-avatar user-avatar--placeholder" />
					<div className="user-info">
						<span className="user-name-placeholder" />
						<span className="user-email-placeholder" />
					</div>
				</div>
			</div>
		);
	}

	if (!session.data) {
		return (
			<div className="user-card">
				<div className="user-card-body">
					<div className="user-avatar user-avatar--anon">?</div>
					<div className="user-info">
						<span className="user-name">Not signed in</span>
						<span className="user-email">Sign in to see your profile</span>
					</div>
				</div>
				<Link href="/auth/sign-in" className="user-card-action">
					Sign in
				</Link>
			</div>
		);
	}

	const { user } = session.data;
	const initials = (user.name || user.email || "?")
		.split(/[\s@]/)
		.slice(0, 2)
		.map((s) => s[0]?.toUpperCase() ?? "")
		.join("");

	return (
		<div className="user-card">
			<div className="user-card-body">
				{user.image ? (
					<img
						className="user-avatar"
						src={user.image}
						alt={user.name || "Avatar"}
					/>
				) : (
					<div className="user-avatar user-avatar--initials">{initials}</div>
				)}
				<div className="user-info">
					<span className="user-name">{user.name || "Unnamed"}</span>
					<span className="user-email">{user.email}</span>
				</div>
			</div>
			<button
				type="button"
				className="user-card-action user-card-action--danger"
				onClick={() =>
					authClient.signOut({
						fetchOptions: { onSuccess: () => window.location.reload() },
					})
				}
			>
				Sign out
			</button>
		</div>
	);
}

function SessionBlock() {
	const session = authClient.useSession();
	const [html, setHtml] = useState("");
	const prev = useRef("");

	const json = useMemo(
		() =>
			JSON.stringify(
				{
					data: session.data ?? null,
					isPending: session.isPending,
				},
				null,
				2,
			),
		[session.data, session.isPending],
	);

	useEffect(() => {
		if (json === prev.current) return;
		let stale = false;
		codeToHtml(json, { lang: "json", theme: "github-dark" }).then((h) => {
			if (!stale) {
				setHtml(h);
				prev.current = json;
			}
		});
		return () => {
			stale = true;
		};
	}, [json]);

	return (
		<section className="session-block bg-[#0a0a0a]">
			<div className="session-header">
				<code className="session-label">useSession()</code>
			</div>
			{html ? (
				<div
					className="session-code"
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			) : (
				<div className="session-code">
					<pre>
						<code>{json}</code>
					</pre>
				</div>
			)}
		</section>
	);
}

export default function Home() {
	return (
		<main className="home relative h-screen bg-black">
			<div className="flex items-center justify-center gap-2 text-center">
				<img
					src="/better-auth-logo-dark.svg"
					alt="Better Auth"
					width={48}
					height={48}
				/>

				<h1 className="home-title">Better Auth UI</h1>
			</div>
			<p className="home-subtitle">Welcome to the Better Auth UI demo!</p>

			<UserCard />

			<SessionBlock />
			<nav className="home-nav">
				{pages.map((p) => (
					<Link key={p.href} href={p.href} className="home-link">
						{p.label}
					</Link>
				))}
			</nav>
		</main>
	);
}
