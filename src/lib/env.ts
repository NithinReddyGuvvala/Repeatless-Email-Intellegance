import { z } from "zod";

/**
 * Zod schema for application environment variables.
 * Each variable has a comment explaining its purpose and where it is used.
 */
export const envSchema = z.object({
  // GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET → Gmail OAuth credentials for user authentication
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),

  // GEMINI_API_KEY → Used for generating email summaries, thread summaries, compose assistance, and the chat agent
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),

  // NVIDIA_API_KEY → Used for smart email categorization and analysis
  NVIDIA_API_KEY: z.string().min(1, "NVIDIA_API_KEY is required"),

  // SUPABASE_URL → Base connection URL for the Supabase project
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),

  // SUPABASE_ANON_KEY → Public anon key used by the frontend Supabase client
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY is required"),

  // SUPABASE_SERVICE_ROLE_KEY → Secret service role key for backend/admin operations only (highly secret, must NEVER be exposed to client)
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
});

export type Env = z.infer<typeof envSchema>;

let isValidated = false;
let validatedEnv: Env | null = null;

/**
 * Validates the environment variables.
 * Throws a clear error listing all missing or invalid variables.
 * Supports passing a custom/runtime environment object (common in serverless/Cloudflare edge contexts).
 *
 * @param runtimeEnv Optional dynamic environment object (e.g. from serverless request context)
 * @returns Validated environment variables
 */
export function validateEnv(runtimeEnv?: Record<string, unknown>): Env {
  // Never perform validation or throw errors on the client side (browser bundle)
  // to avoid client-side crashes and prevent leaking server secrets.
  if (typeof window !== "undefined") {
    const isProcessDefined = typeof process !== "undefined" && process.env;
    return {
      GOOGLE_CLIENT_ID: isProcessDefined ? process.env.GOOGLE_CLIENT_ID || "" : "",
      GOOGLE_CLIENT_SECRET: "",
      GEMINI_API_KEY: "",
      NVIDIA_API_KEY: "",
      SUPABASE_URL: isProcessDefined ? process.env.SUPABASE_URL || "" : "",
      SUPABASE_ANON_KEY: isProcessDefined ? process.env.SUPABASE_ANON_KEY || "" : "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    } as Env;
  }

  // If already validated, return the cached environment variables
  if (isValidated && validatedEnv) {
    return validatedEnv;
  }

  // Combine environments, prioritizing passed runtime variables (e.g., Cloudflare bindings)
  // then process.env, and finally import.meta.env
  const source = {
    ...(typeof process !== "undefined" ? process.env : {}),
    ...(import.meta.env || {}),
    ...(runtimeEnv || {}),
  } as Record<string, string | undefined>;

  const rawEnv = {
    GOOGLE_CLIENT_ID: source.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: source.GOOGLE_CLIENT_SECRET,
    GEMINI_API_KEY: source.GEMINI_API_KEY,
    NVIDIA_API_KEY: source.NVIDIA_API_KEY,
    SUPABASE_URL: source.SUPABASE_URL,
    SUPABASE_ANON_KEY: source.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
  };

  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
      .join("\n");

    const errorMessage = `
❌ Environment Configuration Validation Failed
The following environment variables are missing or invalid:

${formattedErrors}

Please check your environment configuration or .env.local file.
`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  isValidated = true;
  validatedEnv = result.data;
  return validatedEnv;
}

/**
 * Reusable helper to safely retrieve environment variables.
 * On the server, it will trigger validation if it hasn't run yet.
 * On the client, it returns public/safe values or empty strings.
 */
export function getEnv(runtimeEnv?: Record<string, unknown>): Env {
  if (typeof window !== "undefined") {
    // Client-side fallback to avoid throwing on client imports
    const isProcessDefined = typeof process !== "undefined" && process.env;
    return {
      GOOGLE_CLIENT_ID: isProcessDefined ? process.env.GOOGLE_CLIENT_ID || "" : "",
      GOOGLE_CLIENT_SECRET: "",
      GEMINI_API_KEY: "",
      NVIDIA_API_KEY: "",
      SUPABASE_URL: isProcessDefined ? process.env.SUPABASE_URL || "" : "",
      SUPABASE_ANON_KEY: isProcessDefined ? process.env.SUPABASE_ANON_KEY || "" : "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    } as Env;
  }
  return validateEnv(runtimeEnv);
}

// In local development, validate environment variables immediately on module load to give fast feedback.
if (typeof window === "undefined" && process.env.NODE_ENV === "development") {
  try {
    validateEnv();
  } catch (error) {
    console.error("\n[Env Validation] Local development environment check failed.");
  }
}
