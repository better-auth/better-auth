import {zodResolver} from "@hookform/resolvers/zod";
import {createInsertSchema} from "drizzle-zod";
import {Link, Stack, useRouter} from "expo-router";
import * as React from "react";
import {useForm} from "react-hook-form";
import {Alert, Platform, Pressable, ScrollView, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import * as z from "zod";
import {Button} from "@/components/ui/button";
import {
  Form,
  FormCheckbox,
  FormCombobox,
  FormElement,
  FormField,
  FormInput,
  FormRadioGroup,
  FormSelect,
  FormSwitch,
  FormTextarea,
} from "@/components/ui/form";
import {Label} from "@/components/ui/label";
import {RadioGroupItem} from "@/components/ui/radio-group";
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {Text} from "@/components/ui/text";
import {habitTable} from "@/db/schema";
import {cn} from "@/lib/utils";
import {useDatabase} from "@/db/provider";
import {X} from "lucide-react-native";


const HabitCategories = [
  {value: "health", label: "Health And Wellness"},
  {value: "personal-development", label: "Personal Development"},
  {value: "social-and-relationshipts", label: "Social And Relationships"},
  {value: "productivity", label: "Productivity"},
  {value: "creativity", label: "Creativity"},
  {value: "mindfulness", label: "Mindfulness"},
  {value: "financial", label: "Financial"},
  {value: "leisure", label: "Leisure"},
];

const HabitDurations = [
  {value: 5, label: "5 minutes"},
  {value: 10, label: "10 minutes"},
  {value: 15, label: "15 minutes"},
  {value: 30, label: "30 minutes"},
];

const formSchema = createInsertSchema(habitTable, {
  name: (schema) => schema.name.min(4, {
    message: "Please enter a habit name.",
  }),
  description: (schema) => schema.description.min(1, {
    message: "We need to know.",
  }),
  category: z.object(
    {value: z.string(), label: z.string()},
    {
      invalid_type_error: "Please select a favorite email.",
    },
  ),
  duration: z.union([z.string(), z.number()]),
  enableNotifications: z.boolean(),
});


// TODO: refactor to use UI components

export default function FormScreen() {
  const {db} = useDatabase();
  const router = useRouter();

  const scrollRef = React.useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      duration: 5,
      category: {value: "health", label: "Health And Wellness"},
      enableNotifications: false,
    },
  });

  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };

  async function handleSubmit(values: z.infer<typeof formSchema>) {

    try {
      await db?.insert(habitTable).values({
        ...values,
        category: values.category.value,
        duration: Number(values.duration),
      }).returning()
      router.replace("/")
    } catch (e) {
      console.error(e)
    }

  }
  return (
    <ScrollView
      ref={scrollRef}
      contentContainerClassName="p-6 mx-auto w-full max-w-xl"
      showsVerticalScrollIndicator={false}
      automaticallyAdjustContentInsets={false}
      contentInset={{top: 12}}
    >
      <Stack.Screen
        options={{
          title: "New Habit",
          headerRight: () => Platform.OS !== "web" && <Pressable onPress={() => router.dismiss()}><X /></Pressable>
        }}
      />

      <Form {...form}>
        <View className="gap-8">
          <FormField
            control={form.control}
            name="name"
            render={({field}) => (
              <FormInput
                label="Name"
                placeholder="Habit name"
                className="text-foreground"
                description="This will help you remind."
                autoCapitalize="none"
                {...field}
              />
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({field}) => (
              <FormTextarea
                label="Description"
                placeholder="Habit for ..."
                description="habit description"
                {...field}
              />
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({field}) => (
              <FormSelect
                label="Category"
                description="Select on of the habit description"
                {...field}
              >
                <SelectTrigger
                  onLayout={(ev) => {
                    setSelectTriggerWidth(ev.nativeEvent.layout.width);
                  }}
                >
                  <SelectValue
                    className={cn(
                      "text-sm native:text-lg",
                      field.value ? "text-foreground" : "text-muted-foreground",
                    )}
                    placeholder="Select a habit category"
                  />
                </SelectTrigger>
                <SelectContent
                  insets={contentInsets}
                  style={{width: selectTriggerWidth}}
                >
                  <SelectGroup>
                    {HabitCategories.map((cat) => (
                      <SelectItem
                        key={cat.value}
                        label={cat.label}
                        value={cat.value}
                      >
                        <Text>{cat.label}</Text>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </FormSelect>
            )}
          />

          <FormField
            control={form.control}
            name="duration"
            render={({field}) => {
              function onLabelPress(value: number | string) {
                return () => {
                  form.setValue("duration", value);
                };
              }
              return (
                <FormRadioGroup
                  label="Duration"
                  description="Select your duration."
                  className="gap-4"
                  {...field}
                  value={field.value.toString()}
                >
                  {HabitDurations.map((item) => {
                    return (
                      <View
                        key={item.value}
                        className={"flex-row gap-2 items-center"}
                      >
                        <RadioGroupItem
                          aria-labelledby={`label-for-${ item.label }`}
                          value={item.value.toString()}
                        />
                        <Label
                          nativeID={`label-for-${ item.label }`}
                          className="capitalize"
                          onPress={onLabelPress(item.value)}
                        >
                          {item.label}
                        </Label>
                      </View>
                    );
                  })}
                </FormRadioGroup>
              );
            }}
          />

          <FormField
            control={form.control}
            name="enableNotifications"
            render={({field}) => (
              <FormSwitch
                label="Enable reminder"
                description="We will send you notification reminder."
                {...field}
              />
            )}
          />

          <Button onPress={form.handleSubmit(handleSubmit)}>
            <Text>Submit</Text>
          </Button>
          <View>
            <Button
              variant="ghost"
              onPress={() => {
                form.reset();
              }}
            >
              <Text>Clear</Text>
            </Button>
          </View>


        </View>
      </Form>

    </ScrollView >
  );
}
