/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { instrumentationHook: true },
  // instrumentation.ts נבנה גם לסביבת edge; שם לא צריך (ולא אפשר) את חבילות ה-Node.
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === "edge") {
      config.resolve.alias = { ...config.resolve.alias, "./lib/digest": false };
    }
    return config;
  },
};

export default nextConfig;
