import type { EndpointOptions } from 'better-call'

type Method<Path extends string, Options extends EndpointOptions> = {
  path: Path,
  options: Options
}

type PluginInstance<
  ID extends string,
  Namespace extends string,
  Methods extends {
    [K in string]: Method<K, EndpointOptions>
  },
  Impl
> = PluginBase<ID, Namespace, Methods> & Omit<Impl, 'id' | 'namespace' | 'methods' | 'impl'>

type PluginBase<
  ID extends string,
  Namespace extends string,
  Methods extends {
    [K in string]: Method<K, EndpointOptions>
  } = {
    [K in string]: Method<K, EndpointOptions>
  }
> =
  {
    /**
     * A unique identifier for the plugin.
     *
     * This ID is used to reference the plugin in configurations and code.
     *
     * You can use UUID or any unique string as the plugin ID.
     */
    id: ID;

    /**
     * The namespace under which the plugin's features and configurations will be grouped.
     *
     * This helps in organizing and isolating the plugin's functionality within the larger system.
     *
     * Choose a namespace that reflects the plugin's purpose or functionality.
     *
     * For example, a plugin for organization management might use the namespace "organization".
     *
     * If you set the namespace to an empty string, the methods will be registered at the root level.
     */
    namespace: Namespace;

    /**
     * Define the methods (endpoints) provided by the plugin.
     *
     * The key is the endpoint path, and the value is an object containing the path and options.
     *
     * Example:
     * ```ts
     * methods: {
     *   '/user/:id': { path: "/user/:id", options: { method: "GET" } },
     *   '/posts': { path: "/posts", options: { method: "POST" } },
     * }
     * ```
     */
    methods: Methods,

    /**
     * Implement the plugin by providing the actual functionality.
     *
     * Should call this in both server and client side to ensure the plugin is fully functional.
     */
    impl: <Impl>(impl: Impl) => PluginInstance<ID, Namespace, Methods, Impl>
  }

export function declarePlugin<
  ID extends string,
  Namespace extends string = string,
  Methods extends {
    [K in string]: Method<K, EndpointOptions>
  } = {
    [K in string]: Method<K, EndpointOptions>
  }
> (
  id: ID,
  namespace: Namespace,
  methods: Methods
): PluginBase<ID, Namespace, Methods> {
  const pluginBase: PluginBase<ID, Namespace, Methods> = {
    id,
    namespace,
    methods,
    impl: (impl) => {
      const pluginInstance: PluginInstance<ID, Namespace, Methods, typeof impl> = {
        ...pluginBase,
        ...impl
      }
      return pluginInstance
    }
  }
  return pluginBase
}
