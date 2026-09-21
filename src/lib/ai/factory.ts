/**
 * AI provider factory and resolver.
 *
 * Chooses the concrete provider based on the user's stored
 * settings (AiSettings row), falling back to the environment
 * OPENAI_API_KEY when present.
 */
import { PROVIDER_IDS, type AIProvider, type ProviderId } from "./provider";
import { OpenAIApiProvider } from "./openai-api";
import {
  ChatGptOAuthProvider,
  refreshOAuth,
  type OAuthTokens,
} from "./chatgpt-oauth";
import { prisma } from "../db";

/** Input describing the user's configured provider. */
export interface ProviderConfig {
  provider: ProviderId;
  chatModel: string;
  apiKey?: string | null;
  oauthAccessToken?: string | null;
  oauthRefreshToken?: string | null;
  oauthExpiresAt?: Date | null;
}

/** Build a provider instance from a configuration record. */
export function createProvider(config: ProviderConfig): AIProvider {
  switch (config.provider) {
    case "chatgpt-oauth": {
      const provider = new ChatGptOAuthProvider(async () => {
        const tokens = await ensureFreshTokens(config);
        return tokens;
      }, config.chatModel);
      return provider;
    }
    case "openai-api":
    default: {
      const key = config.apiKey || process.env.OPENAI_API_KEY;
      if (!key) {
        throw new Error(
          "No OpenAI API key configured. Set it in Settings or via OPENAI_API_KEY.",
        );
      }
      return new OpenAIApiProvider(key);
    }
  }
}

/** Persisted tokens that may need refreshing before use. */
async function ensureFreshTokens(config: ProviderConfig): Promise<OAuthTokens> {
  const expired =
    !config.oauthExpiresAt || config.oauthExpiresAt.getTime() < Date.now() + 60_000;

  if (!expired && config.oauthAccessToken) {
    return { accessToken: config.oauthAccessToken };
  }

  if (!config.oauthRefreshToken) {
    throw new Error("ChatGPT session expired. Reconnect in Settings.");
  }

  const clientId = process.env.CHATGPT_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error("CHATGPT_OAUTH_CLIENT_ID is not configured.");

  const refreshed = await refreshOAuth(clientId, config.oauthRefreshToken);

  // Persist refreshed tokens so subsequent requests reuse them.
  await prisma.aiSettings.updateMany({
    where: {
      oauthRefreshToken: config.oauthRefreshToken,
      provider: "chatgpt-oauth",
    },
    data: {
      oauthAccessToken: refreshed.accessToken,
      oauthRefreshToken: refreshed.refreshToken,
      oauthExpiresAt: refreshed.expiresAt ? new Date(refreshed.expiresAt) : null,
    },
  });

  return refreshed;
}

/**
 * Load the effective provider config for a user:
 * stored settings take priority; env fallback keeps the app usable.
 */
export async function resolveProviderConfig(userId: string): Promise<ProviderConfig> {
  const settings = await prisma.aiSettings.findUnique({ where: { userId } });

  if (settings && PROVIDER_IDS.includes(settings.provider as ProviderId)) {
    return {
      provider: settings.provider as ProviderId,
      chatModel: settings.chatModel,
      apiKey: settings.apiKey,
      oauthAccessToken: settings.oauthAccessToken,
      oauthRefreshToken: settings.oauthRefreshToken,
      oauthExpiresAt: settings.oauthExpiresAt,
    };
  }

  return {
    provider: "openai-api",
    chatModel: process.env.OPENAI_MODEL || "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY,
  };
}
