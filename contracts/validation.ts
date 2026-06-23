import { z } from "zod";
import { parsePhoneNumberFromString, CountryCode } from "libphonenumber-js";
import { COUNTRIES } from "./countries";

export function getCountryISOFromDialCode(dialCode: string): string | null {
  const cleanCode = dialCode.trim();
  const found = COUNTRIES.find((c) => c.code === cleanCode);
  return found ? found.iso : null;
}

export function parseFullPhone(fullPhone: string, defaultCountry: string = "IN"): { countryCode: string; phoneNumber: string; countryISO: string } | null {
  if (!fullPhone) return null;
  const cleanPhone = fullPhone.trim();
  try {
    const formattedVal = cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone.replace(/^\+/, "")}`;
    let parsed = parsePhoneNumberFromString(formattedVal);
    if (!parsed || !parsed.isValid()) {
      parsed = parsePhoneNumberFromString(cleanPhone, defaultCountry as CountryCode);
    }
    if (parsed && parsed.isValid()) {
      return {
        countryCode: `+${parsed.countryCallingCode}`,
        phoneNumber: parsed.nationalNumber as string,
        countryISO: parsed.country || "IN",
      };
    }
  } catch (e) {
    // Ignore
  }
  return null;
}

export function isValidPhone(phone: string, defaultCountry: string = "IN"): boolean {
  if (!phone) return false;
  try {
    const formattedVal = phone.startsWith("+") ? phone : `+${phone.replace(/^\+/, "")}`;
    let parsed = parsePhoneNumberFromString(formattedVal);
    if (!parsed || !parsed.isValid()) {
      parsed = parsePhoneNumberFromString(phone, defaultCountry as CountryCode);
    }
    return !!(parsed && parsed.isValid());
  } catch (e) {
    return false;
  }
}

export function validatePhoneNumber(countryCode: string, phoneNumber: string, countryISO?: string): string | null {
  if (!countryCode) {
    return "Country code is required.";
  }
  if (!phoneNumber) {
    return "Phone number is required.";
  }
  if (!/^\d+$/.test(phoneNumber)) {
    return "Phone number must contain digits only.";
  }
  
  const iso = countryISO || getCountryISOFromDialCode(countryCode);
  if (!iso) {
    return "Invalid country code selected.";
  }

  try {
    const parsed = parsePhoneNumberFromString(phoneNumber, iso as CountryCode);
    if (!parsed || !parsed.isValid()) {
      return `Invalid phone number for the selected country.`;
    }
  } catch (e) {
    return "Invalid phone number format.";
  }
  return null;
}

export const PHONE_ERROR_MESSAGE = "Please enter a valid mobile number.";

export const phoneSchema = z.string().refine((val) => isValidPhone(val), {
  message: PHONE_ERROR_MESSAGE,
});
