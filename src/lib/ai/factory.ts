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
  refreshOAuthTokens,
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
  oauthAccountId?: string | null;
}

/** Build a provider instance from a configuration record. */
export function createProvider(config: ProviderConfig): AIProvider {
  switch (config.provider) {
    case "chatgpt-oauth": {
      return new ChatGptOAuthProvider(
        () => ensureFreshTokens(config),
        config.chatModel,
      );
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

/**
 * Return valid tokens: use the stored access token while fresh,
 * otherwise refresh and persist the new one.
 */
async function ensureFreshTokens(config: ProviderConfig): Promise<OAuthTokens> {
  const expired =
    !config.oauthExpiresAt || config.oauthExpiresAt.getTime() < Date.now() + 60_000;

  if (!expired && config.oauthAccessToken) {
    return {
      accessToken: config.oauthAccessToken,
      accountId: config.oauthAccountId ?? undefined,
    };
  }

  if (!config.oauthRefreshToken) {
    throw new Error("ChatGPT session expired. Reconnect the account in Settings.");
  }

  const clientId = process.env.CHATGPT_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error("CHATGPT_OAUTH_CLIENT_ID is not configured.");

  const refreshed = await refreshOAuthTokens(clientId, config.oauthRefreshToken);

  // Persist refreshed tokens so subsequent requests reuse them.
  await prisma.aiSettings.updateMany({
    where: { oauthRefreshToken: config.oauthRefreshToken, provider: "chatgpt-oauth" },
    data: {
      oauthAccessToken: refreshed.accessToken,
      oauthRefreshToken: refreshed.refreshToken,
      oauthExpiresAt: refreshed.expiresAt ? new Date(refreshed.expiresAt) : null,
      oauthAccountId: refreshed.accountId,
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
      oauthAccountId: settings.oauthAccountId,
    };
  }

  return {
    provider: "openai-api",
    chatModel: process.env.OPENAI_MODEL || "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY,
  };
}
