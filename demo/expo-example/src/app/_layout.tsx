import { Slot } from "expo-router";
import "../global.css";
import { ImageBackground, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
	return (
		<SafeAreaProvider>
			<ImageBackground
				className="z-0 flex items-center justify-center"
				source={require("../../assets/bg-image.jpeg")}
				resizeMode="cover"
				style={{
					...(StyleSheet.absoluteFill as any),
					width: "100%",
				}}
			>
				<View
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: "black",
						opacity: 0.2,
					}}
				/>
				<Slot />
			</ImageBackground>
		</SafeAreaProvider>
	);
}
