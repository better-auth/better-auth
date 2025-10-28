import Icons from "@expo/vector-icons/AntDesign";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { authClient } from "@/lib/auth-client";

export default function ForgetPassword() {
	const [email, setEmail] = useState("");
	return (
		<Card className="w-10/12 ">
			<CardHeader>
				<CardTitle>Forget Password</CardTitle>
				<CardDescription>
					Enter your email to reset your password
				</CardDescription>
			</CardHeader>
			<View className="px-6 mb-2">
				<Input
					autoCapitalize="none"
					placeholder="Email"
					value={email}
					onChangeText={(text) => setEmail(text)}
				/>
			</View>
			<CardFooter>
				<View className="w-full gap-2">
					<Button
						onPress={() => {
							authClient.forgetPassword({
								email,
								redirectTo: "/reset-password",
							});
						}}
						className="w-full"
						variant="default"
					>
						<Text>Send Email</Text>
					</Button>
					<Button
						onPress={() => {
							router.push("/");
						}}
						className="w-full flex-row gap-4 items-center"
						variant="outline"
					>
						<Icons name="arrowleft" size={18} />
						<Text>Back to Sign In</Text>
					</Button>
				</View>
			</CardFooter>
		</Card>
	);
}
