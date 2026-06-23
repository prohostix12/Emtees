import pg from "pg";
import { env } from "../server/lib/env";

async function applyMigrations() {
  console.log("Applying manual migrations...");
  const isLocal = env.databaseUrl.includes("localhost") || env.databaseUrl.includes("127.0.0.1");
  const pool = new pg.Pool({
    connectionString: env.databaseUrl,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    console.log("Adding sales_executive value to role enum...");
    // Add value if not exists requires a check block in Postgres if done inside transaction or just running it
    // Alter type add value cannot be executed inside a transaction block in older postgres version, pg_enum is checked
    const enumCheck = await client.query(`
      SELECT 1 FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'role' AND e.enumlabel = 'sales_executive';
    `);
    
    if (enumCheck.rows.length === 0) {
      await client.query(`ALTER TYPE "role" ADD VALUE 'sales_executive';`);
      console.log("Added 'sales_executive' to role enum.");
    } else {
      console.log("'sales_executive' already exists in role enum.");
    }

    console.log("Dropping tables if exist to ensure clean slate...");
    await client.query(`DROP TABLE IF EXISTS "sales_executives" CASCADE;`);

    console.log("Creating sales_executives table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "sales_executives" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "employee_id" varchar(50) NOT NULL UNIQUE,
        "name" varchar(255) NOT NULL,
        "email" varchar(320),
        "phone" varchar(50),
        "country_code" varchar(10),
        "country_iso" varchar(10),
        "phone_number" varchar(20),
        "full_international_number" varchar(50),
        "username" varchar(100) NOT NULL,
        "password" varchar(255) NOT NULL,
        "referral_code" varchar(50) NOT NULL UNIQUE,
        "status" varchar(50) DEFAULT 'active' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    console.log("Creating unique indexes on sales_executives...");
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "referral_code_idx" ON "sales_executives" USING btree ("referral_code");`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "employee_id_idx" ON "sales_executives" USING btree ("employee_id");`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "exec_full_phone_idx" ON "sales_executives" USING btree ("full_international_number");`);

    console.log("Adding columns to users table...");
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sales_executive_id" integer REFERENCES "sales_executives"("id") ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referral_code" varchar(50);`);
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "registration_source" varchar(50) DEFAULT 'direct';`);
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "country_iso" varchar(10);`);
    await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "full_international_number" varchar(50);`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "full_int_phone_idx" ON "users" ("full_international_number");`);



    console.log("Adding package_config to profiles...");
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "package_config" json DEFAULT '{"oneToOne": {"total": 0, "min30": 0, "min45": 0, "min60": 0}, "group": {"total": 0, "min30": 0, "min45": 0, "min60": 0}}';`);

    console.log("Adding assigned_teachers to batch_enrollments...");
    await client.query(`ALTER TABLE "batch_enrollments" ADD COLUMN IF NOT EXISTS "assigned_teachers" json DEFAULT '[]';`);

    console.log("Creating student_course_audit_logs table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "student_course_audit_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "student_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "changed_by" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "change_type" varchar(50) NOT NULL,
        "old_value" text,
        "new_value" text,
        "changed_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    console.log("Adding enrollment_id to profiles table...");
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "enrollment_id" varchar(255);`);

    console.log("Creating unique index enrollment_id_unique on profiles...");
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "enrollment_id_unique" ON "profiles" ("enrollment_id");`);

    console.log("Adding parent phone standardized columns to profiles...");
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "parent_country_code" varchar(10);`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "parent_country_iso" varchar(10);`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "parent_phone_number" varchar(20);`);
    await client.query(`ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "parent_full_international_number" varchar(50);`);
    await client.query(`CREATE INDEX IF NOT EXISTS "parent_full_phone_idx" ON "profiles" ("parent_full_international_number");`);

    console.log("Creating student_id_sequence table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "student_id_sequence" (
        "prefix" varchar(50) PRIMARY KEY NOT NULL,
        "last_number" integer NOT NULL DEFAULT 0,
        "number_length" integer NOT NULL DEFAULT 4
      );
    `);

    console.log("Initializing default student ID sequence prefix STU...");
    await client.query(`
      INSERT INTO "student_id_sequence" ("prefix", "last_number", "number_length")
      VALUES ('STU', 0, 4)
      ON CONFLICT DO NOTHING;
    `);

    console.log("Backfilling existing student profiles with union_id as enrollment_id...");
    await client.query(`
      UPDATE "profiles"
      SET "enrollment_id" = u."union_id"
      FROM "users" u
      WHERE "profiles"."user_id" = u."id"
        AND u."role" = 'student'
        AND "profiles"."enrollment_id" IS NULL;
    `);

    console.log("Adding salary enhancement columns...");
    await client.query(`
      ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "actual_duration" integer;

      ALTER TABLE "teacher_salary_configs" ADD COLUMN IF NOT EXISTS "group_30min_rate" decimal(10, 2) DEFAULT '0' NOT NULL;
      ALTER TABLE "teacher_salary_configs" ADD COLUMN IF NOT EXISTS "group_45min_rate" decimal(10, 2) DEFAULT '0' NOT NULL;
      ALTER TABLE "teacher_salary_configs" ADD COLUMN IF NOT EXISTS "group_60min_rate" decimal(10, 2) DEFAULT '0' NOT NULL;
      ALTER TABLE "teacher_salary_configs" ADD COLUMN IF NOT EXISTS "one_to_one_30min_rate" decimal(10, 2) DEFAULT '0' NOT NULL;
      ALTER TABLE "teacher_salary_configs" ADD COLUMN IF NOT EXISTS "one_to_one_45min_rate" decimal(10, 2) DEFAULT '0' NOT NULL;
      ALTER TABLE "teacher_salary_configs" ADD COLUMN IF NOT EXISTS "one_to_one_60min_rate" decimal(10, 2) DEFAULT '0' NOT NULL;

      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "group_30min_count" integer DEFAULT 0;
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "group_45min_count" integer DEFAULT 0;
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "group_60min_count" integer DEFAULT 0;
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "one_to_one_30min_count" integer DEFAULT 0;
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "one_to_one_45min_count" integer DEFAULT 0;
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "one_to_one_60min_count" integer DEFAULT 0;

      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "group_30min_rate" decimal(10, 2) DEFAULT '0';
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "group_45min_rate" decimal(10, 2) DEFAULT '0';
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "group_60min_rate" decimal(10, 2) DEFAULT '0';
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "one_to_one_30min_rate" decimal(10, 2) DEFAULT '0';
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "one_to_one_45min_rate" decimal(10, 2) DEFAULT '0';
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "one_to_one_60min_rate" decimal(10, 2) DEFAULT '0';

      -- Teacher Report Enhancements
      ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "specialization" text;
      ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "experience" text;
      ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "address" text;

      ALTER TABLE "teacher_salary_configs" ADD COLUMN IF NOT EXISTS "bonus_amount" decimal(10, 2) DEFAULT '0' NOT NULL;
      ALTER TABLE "teacher_salary_configs" ADD COLUMN IF NOT EXISTS "deduction_amount" decimal(10, 2) DEFAULT '0' NOT NULL;

      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "bonus_amount" decimal(10, 2) DEFAULT '0';
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "deduction_amount" decimal(10, 2) DEFAULT '0';
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "incentive_amount" decimal(10, 2) DEFAULT '0';
      ALTER TABLE "teacher_salaries" ADD COLUMN IF NOT EXISTS "net_salary" decimal(10, 2) DEFAULT '0';
    `);

    console.log("Migrations applied successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigrations();
