import Ionicons from "@expo/vector-icons/AntDesign";
import { useStore } from "@nanostores/react";
import { router, useNavigationContainerRef } from "expo-router";
import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { authClient } from "@/lib/auth-client";

export default function Index() {
	const { data: isAuthenticated } = useStore(authClient.useSession);
	const navContainerRef = useNavigationContainerRef();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	useEffect(() => {
		if (isAuthenticated) {
			if (navContainerRef.isReady()) {
				router.push("/dashboard");
			}
		}
	}, [isAuthenticated, navContainerRef.isReady()]);
	return (
		<Card className="z-50 mx-6 backdrop-blur-lg bg-gray-200/70">
			<CardHeader className="flex items-center justify-center gap-8">
				<Image
					source={require("../../assets/images/logo.png")}
					style={{
						width: 40,
						height: 40,
					}}
				/>
				<CardTitle>Sign In to your account</CardTitle>
			</CardHeader>
			<View className="px-6 flex gap-2">
				<Button
					onPress={() => {
						authClient.signIn.social({
							provider: "google",
							callbackURL: "/dashboard",
						});
					}}
					variant="secondary"
					className="flex flex-row gap-2 items-center bg-white/50"
				>
					<Ionicons name="google" size={16} />
					<Text>Sign In with Google</Text>
				</Button>
				<Button
					variant="secondary"
					className="flex flex-row gap-2 items-center bg-white/50"
					onPress={() => {
						authClient.signIn.social({
							provider: "github",
							callbackURL: "/dashboard",
						});
					}}
				>
					<Ionicons name="github" size={16} />
					<Text>Sign In with GitHub</Text>
				</Button>
			</View>
			<View className="flex-row gap-2 w-full items-center px-6 my-4">
				<Separator className="flex-grow w-3/12" />
				<Text>or continue with</Text>
				<Separator className="flex-grow w-3/12" />
			</View>
			<View className="px-6">
				<Input
					placeholder="Email Address"
					className="rounded-b-none border-b-0"
					value={email}
					onChangeText={(text) => {
						setEmail(text);
					}}
				/>
				<Input
					placeholder="Password"
					className="rounded-t-none"
					secureTextEntry
					value={password}
					onChangeText={(text) => {
						setPassword(text);
					}}
				/>
			</View>
			<CardFooter>
				<View className="w-full">
					<Button
						variant="link"
						className="w-full"
						onPress={() => {
							router.push("/forget-password");
						}}
					>
						<Text className="underline text-center">Forget Password?</Text>
					</Button>
					<Button
						onPress={() => {
							authClient.signIn.email(
								{
									email,
									password,
								},
								{
									onError: (ctx) => {
										alert(ctx.error.message);
									},
								},
							);
						}}
					>
						<Text>Continue</Text>
					</Button>
					<Text className="text-center mt-2">
						Don't have an account?{" "}
						<Text
							className="underline"
							onPress={() => {
								router.push("/sign-up");
							}}
						>
							Create Account
						</Text>
					</Text>
				</View>
			</CardFooter>
		</Card>
	);
}
