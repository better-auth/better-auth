import { Menubar as MenubarPrimitive } from "bits-ui";

import Root from "./menubar.svelte";
import CheckboxItem from "./menubar-checkbox-item.svelte";
import Content from "./menubar-content.svelte";
import Item from "./menubar-item.svelte";
import Label from "./menubar-label.svelte";
import RadioItem from "./menubar-radio-item.svelte";
import Separator from "./menubar-separator.svelte";
import Shortcut from "./menubar-shortcut.svelte";
import SubContent from "./menubar-sub-content.svelte";
import SubTrigger from "./menubar-sub-trigger.svelte";
import Trigger from "./menubar-trigger.svelte";

const Menu = MenubarPrimitive.Menu;
const Group = MenubarPrimitive.Group;
const Sub = MenubarPrimitive.Sub;
const RadioGroup = MenubarPrimitive.RadioGroup;

export {
	Root,
	CheckboxItem,
	Content,
	Item,
	Label,
	RadioItem,
	Separator,
	Shortcut,
	SubContent,
	SubTrigger,
	Trigger,
	Menu,
	Group,
	Sub,
	RadioGroup,
	//
	Root as Menubar,
	CheckboxItem as MenubarCheckboxItem,
	Content as MenubarContent,
	Item as MenubarItem,
	Label as MenubarLabel,
	RadioItem as MenubarRadioItem,
	Separator as MenubarSeparator,
	Shortcut as MenubarShortcut,
	SubContent as MenubarSubContent,
	SubTrigger as MenubarSubTrigger,
	Trigger as MenubarTrigger,
	Menu as MenubarMenu,
	Group as MenubarGroup,
	Sub as MenubarSub,
	RadioGroup as MenubarRadioGroup,
};
