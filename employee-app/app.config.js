export default ({ config }) => ({
  ...config,
  plugins: [...(config.plugins || []), "expo-status-bar"],
  extra: {
    ...config.extra,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_URL || config.extra?.apiBaseUrl || "https://glamiastore.com"
  }
});
