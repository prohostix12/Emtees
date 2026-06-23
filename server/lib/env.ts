import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || "rzp_test_mockkeyid12345",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || "mockkeysecret67890",
  studentIdPrefix: process.env.STUDENT_ID_PREFIX || "S",
};

export const jwtSecret = new TextEncoder().encode(
  env.appSecret || "emtees-academy-secret-key-2024"
);

