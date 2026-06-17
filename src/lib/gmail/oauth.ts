import { getEnv } from "../env";

/**
 * Reusable Gmail OAuth & Profile service utilities.
 * Uses standard fetch API to interact with Google's OAuth 2.0 and Gmail API endpoints.
 */

// Google OAuth endpoints
const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_PROFILE_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

/**
 * Generates the Google OAuth authorization URL.
 *
 * @param redirectUri The callback URL Google will redirect to
 * @returns The fully constructed Google OAuth URL
 */
export function getGoogleAuthUrl(redirectUri: string): string {
  const env = getEnv();

  const scopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "openid",
    "email",
    "profile",
  ];

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent", // Forces refresh token generation
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

/**
 * Exchanges the Google authorization code for access and refresh tokens.
 *
 * @param code The authorization code from Google callback
 * @param redirectUri The same redirect URI used to generate the auth URL
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const env = getEnv();

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Google Token Exchange Error]:", errorText);
    throw new Error(
      `Failed to exchange authorization code: ${response.statusText}. Details: ${errorText}`,
    );
  }

  return response.json() as Promise<TokenResponse>;
}

interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

/**
 * Retrieves the email address and latest history ID of the authenticated Gmail user.
 *
 * @param accessToken The Google OAuth access token
 */
export async function getGmailProfile(accessToken: string): Promise<GmailProfile> {
  const response = await fetch(GMAIL_PROFILE_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Google Gmail Profile Fetch Error]:", errorText);
    throw new Error(
      `Failed to retrieve Gmail profile: ${response.statusText}. Details: ${errorText}`,
    );
  }

  return response.json() as Promise<GmailProfile>;
}
