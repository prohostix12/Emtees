import pg from "pg";
import { env } from "../server/lib/env";

async function recoverSalesExecutives() {
  console.log("Starting Sales Executive and referral data recovery...");
  const isLocal = env.databaseUrl.includes("localhost") || env.databaseUrl.includes("127.0.0.1");
  const pool = new pg.Pool({
    connectionString: env.databaseUrl,
    connectionTimeoutMillis: 10000, // 10 seconds connection timeout
    query_timeout: 10000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  const client = pool;
  try {
    // 1. Fetch all users with role 'sales_executive'
    const usersRes = await client.query(`
      SELECT id, union_id, name, email, phone, country_code, country_iso, phone_number, full_international_number, username, password, status 
      FROM "users" 
      WHERE role = 'sales_executive'
    `);
    console.log(`Found ${usersRes.rows.length} sales executive accounts in 'users' table.`);

    let recoveredCount = 0;
    for (const user of usersRes.rows) {
      // Check if profile already exists in sales_executives
      const execCheck = await client.query(
        `SELECT id FROM "sales_executives" WHERE user_id = $1`,
        [user.id]
      );

      if (execCheck.rows.length === 0) {
        // Fallback for null fields in user table
        const employeeId = user.union_id || `SE${String(user.id).padStart(4, '0')}`;
        const username = user.username || user.email?.split('@')[0] || `se_${user.id}`;
        const password = user.password || '$2b$10$eImiTXuGP51RJLJ4K95O3eyB/b5N1M21V2o2649B7b2d5v4y9z7t2'; // mock default password hash if null
        const referralCode = employeeId;
        const status = user.status || 'active';

        console.log(`Reconstructing sales executive profile for: ${user.name} (username: ${username}, employeeId: ${employeeId})`);

        await client.query(`
          INSERT INTO "sales_executives" (
            user_id, employee_id, name, email, phone, country_code, country_iso, phone_number, 
            full_international_number, username, password, referral_code, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          user.id,
          employeeId,
          user.name,
          user.email,
          user.phone,
          user.country_code,
          user.country_iso,
          user.phone_number,
          user.full_international_number,
          username,
          password,
          referralCode,
          status
        ]);
        recoveredCount++;
      } else {
        console.log(`Sales executive profile already exists for: ${user.name} (${user.username})`);
      }
    }
    console.log(`Reconstructed ${recoveredCount} sales executive profile records.`);

    // 2. Re-link referred students whose sales_executive_id was set to NULL
    console.log("Restoring student referral relationships...");
    
    // Find students registered via referral who have a referral code but no sales_executive_id link
    const studentsRes = await client.query(`
      SELECT id, name, referral_code 
      FROM "users" 
      WHERE role = 'student' 
        AND registration_source = 'referral' 
        AND referral_code IS NOT NULL 
        AND sales_executive_id IS NULL
    `);
    console.log(`Found ${studentsRes.rows.length} referred students with missing links.`);

    let linkedCount = 0;
    for (const student of studentsRes.rows) {
      // Find matching sales executive by referral code or employee id
      const execRes = await client.query(`
        SELECT id, name 
        FROM "sales_executives" 
        WHERE referral_code = $1 OR employee_id = $1
      `, [student.referral_code]);

      if (execRes.rows.length > 0) {
        const exec = execRes.rows[0];
        console.log(`Linking student ${student.name} to Sales Executive ${exec.name}`);
        await client.query(`
          UPDATE "users" 
          SET sales_executive_id = $1 
          WHERE id = $2
        `, [exec.id, student.id]);
        linkedCount++;
      } else {
        console.log(`Could not find active Sales Executive matching referral code: ${student.referral_code} for student ${student.name}`);
      }
    }

    console.log(`Successfully restored ${linkedCount} student referral links.`);
    console.log("Recovery complete!");
  } catch (err) {
    console.error("Recovery failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

recoverSalesExecutives();
