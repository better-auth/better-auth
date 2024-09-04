import type React from "react";
import {View, Pressable} from "react-native";
import {Button} from "@/components/ui/button";
import {Text} from "@/components/ui/text";
import type {Habit} from "@/lib/storage";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {Badge} from "../ui/badge";
import {Progress} from "../ui/progress";
import {Link} from "expo-router";

type HabitProps = Habit;

export const HabitCard: React.FC<HabitProps> = ({id, name, description, category}: HabitProps) => {
  return (
    <Link href={`/habits/${ id }`} asChild>
      <Pressable>
        <Card className="rounded-2xl">
          <CardHeader>
            <View className="flex-row gap-4 items-center">
              <CardTitle className="pb-2">
                {name}
              </CardTitle>
              <Badge variant="outline">
                <Text >{category}</Text>
              </Badge>
            </View>

            <View className="flex-col">
              <CardDescription className="text-base font-semibold">
                {description}
              </CardDescription>
            </View>
          </CardHeader>
          <CardContent />
          <CardFooter className="flex-col gap-3 flex-1">
            <Progress value={10} className="h-2" indicatorClassName="bg-sky-600" />
          </CardFooter>
        </Card>
      </Pressable>
    </Link>
  );
};
