import pg from "pg";
import { env } from "../../server/lib/env";
import { parsePhoneNumberFromString } from "libphonenumber-js";

async function run() {
  console.log("Starting phone number normalization to E.164...");
  const isLocal = env.databaseUrl.includes("localhost") || env.databaseUrl.includes("127.0.0.1");
  const pool = new pg.Pool({
    connectionString: env.databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    // 1. Normalize users table
    const usersRes = await client.query('SELECT id, phone, "country_code", "phone_number", "country_iso" FROM users');
    console.log(`Normalizing ${usersRes.rows.length} user records...`);
    for (const row of usersRes.rows) {
      let phoneStr = row.phone || "";
      if (row.country_code && row.phone_number) {
        phoneStr = `${row.country_code}${row.phone_number}`;
      }
      if (!phoneStr) continue;

      const parsed = parsePhoneNumberFromString(phoneStr, "IN") || parsePhoneNumberFromString("+" + phoneStr.replace(/^\+/, ""), "IN");
      try {
        let countryCode = row.country_code || "+91";
        let countryISO = row.country_iso || "IN";
        let phoneNumber = row.phone_number || phoneStr.replace(/\D/g, "");
        let fullInternationalNumber = "";
        let phoneE164 = "";

        if (parsed && parsed.isValid()) {
          countryCode = `+${parsed.countryCallingCode}`;
          countryISO = parsed.country || "IN";
          phoneNumber = parsed.nationalNumber as string;
          fullInternationalNumber = parsed.number; // E.164 format: e.g. +919876543210
          phoneE164 = parsed.number;
        } else {
          // Fallback for invalid/unrecognized numbers
          const cleanDigits = phoneStr.replace(/\D/g, "");
          const cleanPhone = phoneStr.replace(/[^\d+]/g, "");
          if (cleanPhone.startsWith("+")) {
            phoneE164 = cleanPhone;
            fullInternationalNumber = cleanPhone;
            countryCode = row.country_code || ("+" + cleanDigits.slice(0, 2));
            phoneNumber = cleanDigits.slice(countryCode.replace("+", "").length);
          } else if (cleanDigits.length === 10) {
            countryCode = "+91";
            countryISO = "IN";
            phoneNumber = cleanDigits;
            fullInternationalNumber = `+91${cleanDigits}`;
            phoneE164 = `+91${cleanDigits}`;
          } else {
            // Keep original digits but strip formatting
            phoneE164 = cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`;
            fullInternationalNumber = phoneE164;
          }
        }

        // Check if there is already another user with the same fullInternationalNumber to prevent uniqueness violation
        const duplicateCheck = await client.query(
          'SELECT id FROM users WHERE "full_international_number" = $1 AND id != $2',
          [fullInternationalNumber, row.id]
        );

        if (duplicateCheck.rows.length > 0) {
          console.warn(`Skipping user ID ${row.id} - duplicate phone number ${fullInternationalNumber} already exists on user ID ${duplicateCheck.rows[0].id}`);
          continue;
        }

        await client.query(
          'UPDATE users SET "country_code" = $1, "country_iso" = $2, "phone_number" = $3, "full_international_number" = $4, "phone" = $5 WHERE id = $6',
          [countryCode, countryISO, phoneNumber, fullInternationalNumber, phoneE164, row.id]
        );
      } catch (err) {
        console.warn(`Failed to update user ID ${row.id}:`, (err as Error).message);
      }
    }

    // 2. Normalize profiles table (parentPhone)
    const profilesRes = await client.query('SELECT id, "parent_phone", "parent_country_code", "parent_phone_number", "parent_country_iso" FROM profiles');
    console.log(`Normalizing ${profilesRes.rows.length} profile parent_phone records...`);
    for (const row of profilesRes.rows) {
      let phoneStr = row.parent_phone || "";
      if (row.parent_country_code && row.parent_phone_number) {
        phoneStr = `${row.parent_country_code}${row.parent_phone_number}`;
      }
      if (!phoneStr) continue;

      const parsed = parsePhoneNumberFromString(phoneStr, "IN") || parsePhoneNumberFromString("+" + phoneStr.replace(/^\+/, ""), "IN");
      try {
        let countryCode = row.parent_country_code || "+91";
        let countryISO = row.parent_country_iso || "IN";
        let phoneNumber = row.parent_phone_number || phoneStr.replace(/\D/g, "");
        let fullInternationalNumber = "";
        let phoneE164 = "";

        if (parsed && parsed.isValid()) {
          countryCode = `+${parsed.countryCallingCode}`;
          countryISO = parsed.country || "IN";
          phoneNumber = parsed.nationalNumber as string;
          fullInternationalNumber = parsed.number;
          phoneE164 = parsed.number;
        } else {
          const cleanDigits = phoneStr.replace(/\D/g, "");
          const cleanPhone = phoneStr.replace(/[^\d+]/g, "");
          if (cleanPhone.startsWith("+")) {
            phoneE164 = cleanPhone;
            fullInternationalNumber = cleanPhone;
            countryCode = row.parent_country_code || ("+" + cleanDigits.slice(0, 2));
            phoneNumber = cleanDigits.slice(countryCode.replace("+", "").length);
          } else if (cleanDigits.length === 10) {
            countryCode = "+91";
            countryISO = "IN";
            phoneNumber = cleanDigits;
            fullInternationalNumber = `+91${cleanDigits}`;
            phoneE164 = `+91${cleanDigits}`;
          } else {
            phoneE164 = cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`;
            fullInternationalNumber = phoneE164;
          }
        }

        await client.query(
          'UPDATE profiles SET "parent_country_code" = $1, "parent_country_iso" = $2, "parent_phone_number" = $3, "parent_full_international_number" = $4, "parent_phone" = $5 WHERE id = $6',
          [countryCode, countryISO, phoneNumber, fullInternationalNumber, phoneE164, row.id]
        );
      } catch (err) {
        console.warn(`Failed to update profile ID ${row.id}:`, (err as Error).message);
      }
    }

    // 3. Normalize sales_executives table
    const execsRes = await client.query('SELECT id, phone, "country_code", "phone_number", "country_iso" FROM sales_executives');
    console.log(`Normalizing ${execsRes.rows.length} sales_executive records...`);
    for (const row of execsRes.rows) {
      let phoneStr = row.phone || "";
      if (row.country_code && row.phone_number) {
        phoneStr = `${row.country_code}${row.phone_number}`;
      }
      if (!phoneStr) continue;

      const parsed = parsePhoneNumberFromString(phoneStr, "IN") || parsePhoneNumberFromString("+" + phoneStr.replace(/^\+/, ""), "IN");
      try {
        let countryCode = row.country_code || "+91";
        let countryISO = row.country_iso || "IN";
        let phoneNumber = row.phone_number || phoneStr.replace(/\D/g, "");
        let fullInternationalNumber = "";
        let phoneE164 = "";

        if (parsed && parsed.isValid()) {
          countryCode = `+${parsed.countryCallingCode}`;
          countryISO = parsed.country || "IN";
          phoneNumber = parsed.nationalNumber as string;
          fullInternationalNumber = parsed.number;
          phoneE164 = parsed.number;
        } else {
          const cleanDigits = phoneStr.replace(/\D/g, "");
          const cleanPhone = phoneStr.replace(/[^\d+]/g, "");
          if (cleanPhone.startsWith("+")) {
            phoneE164 = cleanPhone;
            fullInternationalNumber = cleanPhone;
            countryCode = row.country_code || ("+" + cleanDigits.slice(0, 2));
            phoneNumber = cleanDigits.slice(countryCode.replace("+", "").length);
          } else if (cleanDigits.length === 10) {
            countryCode = "+91";
            countryISO = "IN";
            phoneNumber = cleanDigits;
            fullInternationalNumber = `+91${cleanDigits}`;
            phoneE164 = `+91${cleanDigits}`;
          } else {
            phoneE164 = cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`;
            fullInternationalNumber = phoneE164;
          }
        }

        const duplicateCheck = await client.query(
          'SELECT id FROM sales_executives WHERE "full_international_number" = $1 AND id != $2',
          [fullInternationalNumber, row.id]
        );

        if (duplicateCheck.rows.length > 0) {
          console.warn(`Skipping sales_executive ID ${row.id} - duplicate phone number ${fullInternationalNumber} already exists on ID ${duplicateCheck.rows[0].id}`);
          continue;
        }

        await client.query(
          'UPDATE sales_executives SET "country_code" = $1, "country_iso" = $2, "phone_number" = $3, "full_international_number" = $4, "phone" = $5 WHERE id = $6',
          [countryCode, countryISO, phoneNumber, fullInternationalNumber, phoneE164, row.id]
        );
      } catch (err) {
        console.warn(`Failed to update sales_executive ID ${row.id}:`, (err as Error).message);
      }
    }

    console.log("Phone number normalization completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
