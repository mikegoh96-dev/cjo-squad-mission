import { squadConfig } from "./squad.ts";

export const siteConfig = {
  name: squadConfig.appName,
  tagline: squadConfig.tagline,
  description: squadConfig.description,
} as const;
