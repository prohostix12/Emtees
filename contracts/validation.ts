import { z } from "zod";

export const COUNTRY_CODES = [
  { code: "+91", country: "India", length: 10 },
  { code: "+1", country: "US/Canada", length: 10 },
  { code: "+44", country: "United Kingdom", length: 10 },
  { code: "+971", country: "UAE", length: 9 },
  { code: "+966", country: "Saudi Arabia", length: 9 },
  { code: "+974", country: "Qatar", length: 8 },
  { code: "+965", country: "Kuwait", length: 8 },
  { code: "+973", country: "Bahrain", length: 8 },
  { code: "+968", country: "Oman", length: 8 },
  { code: "+65", country: "Singapore", length: 8 },
  { code: "+61", country: "Australia", length: 9 },
] as const;

export function parseFullPhone(fullPhone: string): { countryCode: string; phoneNumber: string } | null {
  const cleanPhone = fullPhone.trim();
  // Sort country codes by length descending to match longer ones first
  const sortedCodes = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sortedCodes) {
    if (cleanPhone.startsWith(c.code)) {
      const number = cleanPhone.slice(c.code.length).replace(/\s+/g, "");
      return { countryCode: c.code, phoneNumber: number };
    }
  }
  // Fallback to India if it's 10 digits and contains only digits starting with 6-9
  const digits = cleanPhone.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return { countryCode: "+91", phoneNumber: digits };
  }
  return null;
}

export function isValidPhone(phone: string): boolean {
  const parsed = parseFullPhone(phone);
  if (!parsed) return false;
  const config = COUNTRY_CODES.find((c) => c.code === parsed.countryCode);
  if (!config) return false;
  if (!/^\d+$/.test(parsed.phoneNumber)) return false;
  return parsed.phoneNumber.length === config.length;
}

export function validatePhoneNumber(countryCode: string, phoneNumber: string): string | null {
  if (!countryCode) {
    return "Country code is required.";
  }
  const config = COUNTRY_CODES.find((c) => c.code === countryCode);
  if (!config) {
    return "Invalid country code selected.";
  }
  if (!phoneNumber) {
    return "Phone number is required.";
  }
  if (!/^\d+$/.test(phoneNumber)) {
    return "Phone number must contain digits only.";
  }
  if (phoneNumber.length !== config.length) {
    return `Phone number must be exactly ${config.length} digits for ${config.country}.`;
  }
  return null;
}

export const PHONE_ERROR_MESSAGE = "Please enter a valid 10-digit mobile number.";

export const phoneSchema = z.string().refine((val) => isValidPhone(val), {
  message: PHONE_ERROR_MESSAGE,
});

