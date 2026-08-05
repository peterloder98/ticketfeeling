/**
 * Wallet pass configuration (Apple PKPass + Google Wallet).
 * Buyers never see setup errors — UI buttons are hidden when unset.
 */

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function envPem(name: string): string {
  return env(name).replace(/\\n/g, "\n");
}

function appBaseUrl() {
  return (process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export type AppleWalletConfig = {
  passTypeIdentifier: string;
  teamIdentifier: string;
  wwdrPem: string;
  signerCertPem: string;
  signerKeyPem: string;
  signerKeyPassphrase: string;
  webServiceUrl: string;
  /** Optional APNs .p8 for void push notifications */
  apnsKeyId: string;
  apnsKeyPem: string;
  apnsTopic: string;
};

export type GoogleWalletConfig = {
  issuerId: string;
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
  /** Optional override; default uses event id as class suffix */
  defaultClassSuffix: string;
};

export function getAppleWalletConfig(): AppleWalletConfig | null {
  const passTypeIdentifier = env("APPLE_PASS_TYPE_ID");
  const teamIdentifier = env("APPLE_TEAM_ID");
  const wwdrPem = envPem("APPLE_PASS_WWDR_PEM") || readOptionalFile(env("APPLE_PASS_WWDR_PATH"));
  const signerCertPem =
    envPem("APPLE_PASS_CERT_PEM") || readOptionalFile(env("APPLE_PASS_CERT_PATH"));
  const signerKeyPem =
    envPem("APPLE_PASS_KEY_PEM") || readOptionalFile(env("APPLE_PASS_KEY_PATH"));
  if (!passTypeIdentifier || !teamIdentifier || !wwdrPem || !signerCertPem || !signerKeyPem) {
    return null;
  }
  const webServiceUrl =
    env("APPLE_PASS_WEB_SERVICE_URL") || `${appBaseUrl()}/api/v1/wallet/apple`;
  return {
    passTypeIdentifier,
    teamIdentifier,
    wwdrPem,
    signerCertPem,
    signerKeyPem,
    signerKeyPassphrase: env("APPLE_PASS_KEY_PASSPHRASE"),
    webServiceUrl: webServiceUrl.replace(/\/$/, ""),
    apnsKeyId: env("APPLE_PASS_APNS_KEY_ID"),
    apnsKeyPem: envPem("APPLE_PASS_APNS_KEY_PEM") || readOptionalFile(env("APPLE_PASS_APNS_KEY_PATH")),
    apnsTopic: env("APPLE_PASS_APNS_TOPIC") || passTypeIdentifier,
  };
}

export function getGoogleWalletConfig(): GoogleWalletConfig | null {
  const issuerId = env("GOOGLE_WALLET_ISSUER_ID");
  const serviceAccountEmail = env("GOOGLE_WALLET_SA_EMAIL");
  const serviceAccountPrivateKey =
    envPem("GOOGLE_WALLET_SA_PRIVATE_KEY") ||
    readOptionalFile(env("GOOGLE_WALLET_SA_KEY_PATH"));
  if (!issuerId || !serviceAccountEmail || !serviceAccountPrivateKey) {
    return null;
  }
  return {
    issuerId,
    serviceAccountEmail,
    serviceAccountPrivateKey,
    defaultClassSuffix: env("GOOGLE_WALLET_CLASS_SUFFIX") || "ticketfeeling_event",
  };
}

export function isAppleWalletConfigured() {
  return getAppleWalletConfig() != null;
}

export function isGoogleWalletConfigured() {
  return getGoogleWalletConfig() != null;
}

/** Server-safe flags for UI (hide buyer buttons when unset). */
export function getWalletUiFlags() {
  return {
    apple: isAppleWalletConfigured(),
    google: isGoogleWalletConfigured(),
  };
}

function readOptionalFile(filePath: string): string {
  if (!filePath) return "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    if (!fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}
