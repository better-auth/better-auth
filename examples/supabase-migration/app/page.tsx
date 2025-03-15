"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Session } from "@supabase/supabase-js";
import Image from "next/image";
import { useEffect, useState } from "react";

const useSession = () => {
	const [session, setSession] = useState<Session | null>(null);

	useEffect(() => {
		supabase.auth.getSession().then(({ data }) => setSession(data.session));
	}, []);
	return session;
};

export default function Home() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const session = useSession();
	return (
		<div>
			{session ? (
				<Card>
					<CardHeader>
						<CardTitle>Signed in</CardTitle>
					</CardHeader>
					<CardContent>
						<div>
							<p>Email: {session.user.email}</p>
							<Button onClick={() => supabase.auth.signOut()}>Sign Out</Button>
						</div>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardHeader>
						<CardTitle>Sign Up</CardTitle>
					</CardHeader>
					<CardContent className="gap-2 flex flex-col">
						<Input
							placeholder="Email"
							onChange={(e) => setEmail(e.target.value)}
						/>
						<Input
							placeholder="Password"
							onChange={(e) => setPassword(e.target.value)}
						/>
						<Button
							onClick={async () => {
								await supabase.auth.signInWithPassword({
									email,
									password,
								});
							}}
						>
							Sign Up
						</Button>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
