import * as React from "react";
import {type ListRenderItemInfo, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {cn} from "../../lib/utils";
import {Check, ChevronsUpDown, Search} from "../Icons";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetFlatList,
  BottomSheetHeader,
  BottomSheetOpenTrigger,
  BottomSheetTextInput,
  useBottomSheet,
} from "./bottom-sheet";
import {Button, buttonTextVariants, buttonVariants} from "./button";

// TODO: refactor and move to UI
// TODO: create web component, use https://ui.shadcn.com/docs/components/combobox

const HEADER_HEIGHT = 130;

interface ComboboxOption {
  label?: string;
  value?: string;
}

const Combobox = React.forwardRef<
  React.ElementRef<typeof Button>,
  Omit<React.ComponentPropsWithoutRef<typeof Button>, "children"> & {
    items: ComboboxOption[];
    placeholder?: string;
    inputProps?: React.ComponentPropsWithoutRef<typeof BottomSheetTextInput>;
    emptyText?: string;
    defaultSelectedItem?: ComboboxOption | null;
    selectedItem?: ComboboxOption | null;
    onSelectedItemChange?: (option: ComboboxOption | null) => void;
  }
>(
  (
    {
      className,
      textClass,
      variant = "outline",
      size = "sm",
      inputProps,
      placeholder,
      items,
      emptyText = "Nothing found...",
      defaultSelectedItem = null,
      selectedItem: selectedItemProp,
      onSelectedItemChange,
      ...props
    },
    ref,
  ) => {
    const insets = useSafeAreaInsets();
    const [search, setSearch] = React.useState("");
    const [selectedItem, setSelectedItem] =
      React.useState<ComboboxOption | null>(defaultSelectedItem);
    const bottomSheet = useBottomSheet();
    const inputRef =
      React.useRef<React.ComponentRef<typeof BottomSheetTextInput>>(null);

    const listItems = React.useMemo(() => {
      return search
        ? items.filter((item) => {
          return item.label
            ?.toLocaleLowerCase()
            .includes(search.toLocaleLowerCase());
        })
        : items;
    }, [items, search]);

    function onItemChange(listItem: ComboboxOption) {
      if (selectedItemProp?.value === listItem.value) {
        return null;
      }
      setSearch("");
      bottomSheet.close();
      return listItem;
    }

    const renderItem = React.useCallback(
      ({item}: ListRenderItemInfo<unknown>) => {
        const listItem = item as ComboboxOption;
        const isSelected = onSelectedItemChange
          ? selectedItemProp?.value === listItem.value
          : selectedItem?.value === listItem.value;
        return (
          <Button
            variant="ghost"
            className="items-center flex-row flex-1 justify-between px-3 py-4"
            style={{minHeight: 70}}
            onPress={() => {
              if (onSelectedItemChange) {
                onSelectedItemChange(onItemChange(listItem));
                return;
              }
              setSelectedItem(onItemChange(listItem));
            }}
          >
            <View className="flex-row flex-1">
              <Text className={"text-foreground text-xl"}>
                {listItem.label}
              </Text>
            </View>
            {isSelected && (
              <Check size={24} className={"text-foreground px-6 mt-1.5"} />
            )}
          </Button>
        );
      },
      [selectedItem, selectedItemProp],
    );

    function onSubmitEditing() {
      const firstItem = listItems[0];
      if (!firstItem) return;
      if (onSelectedItemChange) {
        onSelectedItemChange(firstItem);
      } else {
        setSelectedItem(firstItem);
      }
      bottomSheet.close();
    }

    function onSearchIconPress() {
      if (!inputRef.current) return;
      const input = inputRef.current;
      if (input && "focus" in input && typeof input.focus === "function") {
        input.focus();
      }
    }

    const itemSelected = onSelectedItemChange ? selectedItemProp : selectedItem;

    return (
      <BottomSheet>
        <BottomSheetOpenTrigger
          ref={ref}
          className={buttonVariants({
            variant,
            size,
            className: cn("flex-row w-full", className),
          })}
          role="combobox"
          {...props}
        >
          <View className="flex-1 flex-row justify-between ">
            <Text
              className={buttonTextVariants({
                variant,
                size,
                className: cn(!itemSelected && "opacity-50", textClass),
              })}
              numberOfLines={1}
            >
              {itemSelected ? itemSelected.label : placeholder ?? ""}
            </Text>
            <ChevronsUpDown className="text-foreground ml-2 opacity-50" />
          </View>
        </BottomSheetOpenTrigger>
        <BottomSheetContent
          ref={bottomSheet.ref}
          onDismiss={() => {
            setSearch("");
          }}
        >
          <BottomSheetHeader className="border-b-0">
            <Text className="text-foreground text-xl font-bold text-center px-0.5">
              {placeholder}
            </Text>
          </BottomSheetHeader>
          <View className="relative px-4 border-b border-border pb-4">
            <BottomSheetTextInput
              role="searchbox"
              ref={inputRef}
              className="pl-12"
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={onSubmitEditing}
              returnKeyType="next"
              clearButtonMode="while-editing"
              placeholder="Search..."
              {...inputProps}
            />
            <Button
              variant={"ghost"}
              size="sm"
              className="absolute left-4 top-2.5"
              onPress={onSearchIconPress}
            >
              <Search size={18} className="text-foreground opacity-50" />
            </Button>
          </View>
          <BottomSheetFlatList
            data={listItems}
            contentContainerStyle={{
              paddingBottom: insets.bottom + HEADER_HEIGHT,
            }}
            renderItem={renderItem}
            keyExtractor={(item, index) =>
              (item as ComboboxOption)?.value ?? index.toString()
            }
            className={"px-4"}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={() => {
              return (
                <View
                  className="items-center flex-row justify-center flex-1  px-3 py-5"
                  style={{minHeight: 70}}
                >
                  <Text className={"text-muted-foreground text-xl text-center"}>
                    {emptyText}
                  </Text>
                </View>
              );
            }}
          />
        </BottomSheetContent>
      </BottomSheet>
    );
  },
);

Combobox.displayName = "Combobox";

export {Combobox, type ComboboxOption};
