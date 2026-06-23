import pg from "pg";
import { env } from "../server/lib/env";
import { parsePhoneNumberFromString } from "libphonenumber-js";

async function runMigration() {
  console.log("Starting phone number migration...");
  const isLocal = env.databaseUrl.includes("localhost") || env.databaseUrl.includes("127.0.0.1");
  const pool = new pg.Pool({
    connectionString: env.databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    // 1. Migrate users table
    const usersRes = await client.query('SELECT id, phone, "country_code", "phone_number" FROM users');
    console.log(`Migrating ${usersRes.rows.length} user records...`);
    for (const row of usersRes.rows) {
      let phoneStr = row.phone || "";
      if (row.country_code && row.phone_number) {
        phoneStr = `${row.country_code}${row.phone_number}`;
      }
      if (!phoneStr) continue;
      
      const parsed = parsePhoneNumberFromString(phoneStr, "IN") || parsePhoneNumberFromString("+" + phoneStr.replace(/^\+/, ""), "IN");
      try {
        if (parsed && parsed.isValid()) {
          const countryCode = `+${parsed.countryCallingCode}`;
          const countryISO = parsed.country || "IN";
          const phoneNumber = parsed.nationalNumber;
          const fullInternationalNumber = parsed.number; // E.164
          
          await client.query(
            'UPDATE users SET "country_code" = $1, "country_iso" = $2, "phone_number" = $3, "full_international_number" = $4, "phone" = $5 WHERE id = $6',
            [countryCode, countryISO, phoneNumber, fullInternationalNumber, `${countryCode} ${phoneNumber}`, row.id]
          );
        } else {
          // Fallback for invalid/empty numbers
          const cleanDigits = phoneStr.replace(/\D/g, "");
          if (cleanDigits.length >= 8) {
            const isIndia = cleanDigits.length === 10;
            const countryCode = "+91";
            const countryISO = "IN";
            const phoneNumber = isIndia ? cleanDigits : cleanDigits.slice(-10);
            const fullInternationalNumber = `${countryCode}${phoneNumber}`;
            await client.query(
              'UPDATE users SET "country_code" = $1, "country_iso" = $2, "phone_number" = $3, "full_international_number" = $4, "phone" = $5 WHERE id = $6',
              [countryCode, countryISO, phoneNumber, fullInternationalNumber, `${countryCode} ${phoneNumber}`, row.id]
            );
          }
        }
      } catch (err) {
        console.warn(`Skipping duplicate/invalid user phone update for user ID ${row.id} (${phoneStr}):`, (err as Error).message);
      }
    }

    // 2. Migrate profiles table (parentPhone)
    const profilesRes = await client.query('SELECT id, "parent_phone" FROM profiles');
    console.log(`Migrating ${profilesRes.rows.length} profile parent_phone records...`);
    for (const row of profilesRes.rows) {
      const phoneStr = row.parent_phone;
      if (!phoneStr) continue;

      const parsed = parsePhoneNumberFromString(phoneStr, "IN") || parsePhoneNumberFromString("+" + phoneStr.replace(/^\+/, ""), "IN");
      try {
        if (parsed && parsed.isValid()) {
          const countryCode = `+${parsed.countryCallingCode}`;
          const countryISO = parsed.country || "IN";
          const phoneNumber = parsed.nationalNumber;
          const fullInternationalNumber = parsed.number;

          await client.query(
            'UPDATE profiles SET "parent_country_code" = $1, "parent_country_iso" = $2, "parent_phone_number" = $3, "parent_full_international_number" = $4, "parent_phone" = $5 WHERE id = $6',
            [countryCode, countryISO, phoneNumber, fullInternationalNumber, `${countryCode} ${phoneNumber}`, row.id]
          );
        }
      } catch (err) {
        console.warn(`Skipping profile parent phone update for profile ID ${row.id} (${phoneStr}):`, (err as Error).message);
      }
    }

    // 3. Migrate sales_executives table
    const execsRes = await client.query('SELECT id, phone FROM sales_executives');
    console.log(`Migrating ${execsRes.rows.length} sales_executive records...`);
    for (const row of execsRes.rows) {
      const phoneStr = row.phone;
      if (!phoneStr) continue;

      const parsed = parsePhoneNumberFromString(phoneStr, "IN") || parsePhoneNumberFromString("+" + phoneStr.replace(/^\+/, ""), "IN");
      try {
        if (parsed && parsed.isValid()) {
          const countryCode = `+${parsed.countryCallingCode}`;
          const countryISO = parsed.country || "IN";
          const phoneNumber = parsed.nationalNumber;
          const fullInternationalNumber = parsed.number;

          await client.query(
            'UPDATE sales_executives SET "country_code" = $1, "country_iso" = $2, "phone_number" = $3, "full_international_number" = $4, "phone" = $5 WHERE id = $6',
            [countryCode, countryISO, phoneNumber, fullInternationalNumber, `${countryCode} ${phoneNumber}`, row.id]
          );
        }
      } catch (err) {
        console.warn(`Skipping sales executive phone update for ID ${row.id} (${phoneStr}):`, (err as Error).message);
      }
    }


    console.log("Phone number migrations completed successfully!");
  } catch (err) {
    console.error("Phone number migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
