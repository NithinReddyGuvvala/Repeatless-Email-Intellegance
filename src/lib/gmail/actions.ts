import { createServerFn } from "@tanstack/react-start";
import { getGoogleAuthUrl, exchangeCodeForTokens, getGmailProfile } from "./oauth";
import { supabaseAdmin, getAuthenticatedUser } from "../supabase/server";

/**
 * Server function to generate the Google OAuth redirect URL.
 */
export const getGoogleAuthUrlAction = createServerFn()
  .validator((redirectUri: string) => {
    if (typeof redirectUri !== "string" || !redirectUri) {
      throw new Error("redirectUri must be a non-empty string");
    }
    return redirectUri;
  })
  .handler(async ({ data: redirectUri }) => {
    const url = getGoogleAuthUrl(redirectUri);
    return { url };
  });

interface CallbackPayload {
  code: string;
  redirectUri: string;
}

/**
 * Server function to handle the Google OAuth callback.
 * Exchanges the auth code for tokens, retrieves the Gmail email address,
 * maps it to the currently authenticated user, and saves it in Supabase.
 */
export const handleGoogleCallbackAction = createServerFn()
  .validator((payload: CallbackPayload) => {
    if (!payload.code || typeof payload.code !== "string") {
      throw new Error("Authorization code is required");
    }
    if (!payload.redirectUri || typeof payload.redirectUri !== "string") {
      throw new Error("Redirect URI is required");
    }
    return payload;
  })
  .handler(async ({ data: { code, redirectUri } }) => {
    // 1. Get currently authenticated Supabase user
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("Unauthorized: Please sign in to link your Gmail account.");
    }

    if (!supabaseAdmin) {
      throw new Error("Database connection unavailable.");
    }

    try {
      // 2. Exchange code for access & refresh tokens
      const tokenData = await exchangeCodeForTokens(code, redirectUri);

      // 3. Retrieve Gmail profile address and history ID
      const gmailProfile = await getGmailProfile(tokenData.access_token);

      // Calculate token expiration timestamp
      const tokenExpiresAt = new Date();
      tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + tokenData.expires_in);

      // 4. Save/Upsert account credentials in gmail_accounts table
      const upsertData: {
        user_id: string;
        email_address: string;
        access_token: string;
        token_expires_at: string;
        last_synced_at: string;
        refresh_token?: string;
        gmail_history_id?: string;
      } = {
        user_id: user.id,
        email_address: gmailProfile.emailAddress.toLowerCase(),
        access_token: tokenData.access_token,
        token_expires_at: tokenExpiresAt.toISOString(),
        last_synced_at: new Date().toISOString(),
      };

      // Only save/overwrite refresh token if it is returned by Google
      // (Google only sends the refresh_token on the first user approval prompt)
      if (tokenData.refresh_token) {
        upsertData.refresh_token = tokenData.refresh_token;
      }

      // Save the latest historyId as bigint if provided
      if (gmailProfile.historyId) {
        upsertData.gmail_history_id = gmailProfile.historyId;
      }

      const { error } = await supabaseAdmin
        .from("gmail_accounts")
        .upsert(upsertData, {
          onConflict: "user_id,email_address",
        })
        .select()
        .single();

      if (error) {
        console.error("[OAuth Callback Upsert Error]:", error);
        throw new Error(`Failed to store Gmail account: ${error.message}`);
      }

      return {
        success: true,
        emailAddress: gmailProfile.emailAddress,
      };
    } catch (error) {
      console.error("[OAuth Callback Action Failure]:", error);
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during Gmail integration.";
      throw new Error(message);
    }
  });
