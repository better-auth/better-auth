const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('sql');

module.exports = withNativeWind(config, { input: "./app/styles.css", configPath: "./tailwind.config.ts", });
