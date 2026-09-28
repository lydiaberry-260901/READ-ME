// Runs before every test file.
import "dotenv/config";

// Tests always use the separate test database, never the development one.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Fixed, fake keys so encryption tests do not depend on local settings.
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.SUPPRESSION_HMAC_KEY = Buffer.alloc(32, 9).toString("base64");
