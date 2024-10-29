import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { authClient } from "@/lib/auth-client";
import { View } from "react-native";
import Ionicons from "@expo/vector-icons/AntDesign";
import { ImageBackground } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useEffect } from "react";

export default function Dashboard() {
	const { data: session, error } = authClient.useSession();
	return (
		<SafeAreaView>
			<ImageBackground
				className="z-0 flex items-center justify-center flex-row"
				source={{
					uri: "https://images.pexels.com/photos/7233359/pexels-photo-7233359.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2",
				}}
				resizeMode="cover"
				style={{
					width: "100%",
					height: "100%",
				}}
			>
				<Card className="flex-grow mx-6">
					<CardHeader>
						<View className="flex-row items-center gap-2">
							<Avatar alt="user-image">
								<AvatarImage
									source={{
										uri: session?.user?.image,
									}}
								/>
								<AvatarFallback>
									<Text>{session?.user?.name[0]}</Text>
								</AvatarFallback>
							</Avatar>
							<View>
								<Text className="font-bold">{session?.user?.name}</Text>
								<Text className="text-sm">{session?.user?.email}</Text>
							</View>
						</View>
					</CardHeader>
					<View className="my-2">
						<Button
							variant="default"
							size="sm"
							className="mx-6 flex-row items-center gap-2	"
						>
							<Ionicons name="edit" size={16} color="white" />
							<Text>Edit User</Text>
						</Button>
					</View>
					<CardFooter>
						<Button
							variant="secondary"
							onPress={() => {
								authClient.signOut({
									fetchOptions: {
										onResponse(context) {
											router.push("/");
										},
									},
								});
							}}
						>
							<Text>Sign Out</Text>
						</Button>
					</CardFooter>
				</Card>
			</ImageBackground>
		</SafeAreaView>
	);
}
