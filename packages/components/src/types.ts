import {FormPlugin} from "./methods/form"

export const components = [
	"signIn"
]

export const methods = [
	"form"
]

export type AllPlugins = FormPlugin

export type BasePlugin<P extends AllPlugins> = {
	/**
	 * The components this plugin should run on
	 * 
	 * If given an empty list, this plugin is effectively disabled
	 * If not given, works on all components
	 * 
	 * @default all
	 */
	components?: (typeof components)[number][]| [];
	/**
	* The methods this plugin should run on
	* 
	* If given an empty list, this plugin is effectively disabled
	* If not given, works on all methods
	* 
	* @default all
	*/
	methods?: (typeof components)[number][]| [];
	
	/**
	 * The plugin config itself
	 * Will be passed to the component when enabled
	 */
	plugin: P;
}