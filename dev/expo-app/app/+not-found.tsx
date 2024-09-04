import {Link, Stack} from "expo-router";
import {View} from "react-native";
import {Text} from "@/components/ui";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{title: "Oops!"}} />
      <View>
        <Text>This screen doesn't exist.</Text>

        <Link href="/">
          <Text>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}
