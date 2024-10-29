import Ionicons from "@expo/vector-icons/AntDesign";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { authClient } from "@/lib/auth-client";
import { Image, ImageBackground, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useEffect } from "react";
import { router, useNavigationContainerRef } from "expo-router";

export default function Index() {
	const isAuthenticated = authClient.useIsAuthenticated();
	const navContainerRef = useNavigationContainerRef();

	useEffect(() => {
		if (isAuthenticated) {
			if (navContainerRef.isReady()) {
				router.push("/dashboard");
			}
		}
	}, [isAuthenticated]);
	return (
		<SafeAreaView>
			<ImageBackground
				className="z-0 flex items-center justify-center"
				source={{
					uri: "https://images.pexels.com/photos/7233359/pexels-photo-7233359.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
				}}
				resizeMode="cover"
				style={{
					width: "100%",
					height: "100%",
				}}
			>
				<Card className="z-50 mx-6">
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
							className="flex flex-row gap-2 items-center"
						>
							<Ionicons name="google" size={16} />
							<Text>Sign In with Google</Text>
						</Button>
						<Button
							variant="secondary"
							className="flex flex-row gap-2 items-center"
							onPress={() => {
								authClient.signIn.social({
									provider: "github",
									callbackURL: "/dashboard",
								});
							}}
						>
							<Ionicons name="github" size={16} />
							<Text>Sign In with Github</Text>
						</Button>
					</View>
					<View className="flex-row gap-2 w-full items-center px-6 my-4">
						<Separator className="flex-grow w-3/12" />
						<Text>or continue with</Text>
						<Separator className="flex-grow w-3/12" />
					</View>
					<View className="px-6">
						<Input placeholder="Email" className="rounded-b-none border-b-0" />
						<Input placeholder="Password" className="rounded-t-none" />
					</View>
					<CardFooter>
						<View className="w-full">
							<Button variant="link" className="w-full">
								<Text className="underline text-center">Forget Password?</Text>
							</Button>
							<Button>
								<Text>Continue</Text>
							</Button>
						</View>
					</CardFooter>
				</Card>
			</ImageBackground>
		</SafeAreaView>
	);
}
