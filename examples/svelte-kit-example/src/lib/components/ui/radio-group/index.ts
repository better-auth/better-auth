import { RadioGroup as RadioGroupPrimitive } from "bits-ui";

import Root from "./radio-group.svelte";
import Item from "./radio-group-item.svelte";
const Input = RadioGroupPrimitive.Input;

export {
	Root,
	Input,
	Item,
	//
	Root as RadioGroup,
	Input as RadioGroupInput,
	Item as RadioGroupItem,
};
