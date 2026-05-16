import { createServerFn } from "@tanstack/react-start";
import { getProviderStatuses, getActiveProviderName, detectProvider } from "./ai-provider";

/** Returns the status of all AI providers (which keys are configured, which is active). */
export const getAIProviderStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const providers = getProviderStatuses();
    const activeProvider = getActiveProviderName();
    const hasAny = providers.some((p) => p.configured);
    return { providers, activeProvider, hasAny };
  },
);
