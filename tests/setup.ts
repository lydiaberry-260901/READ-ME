// Runs before every test file.
import "dotenv/config";

// Tests always use the separate test database, never the development one.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Tests never call real outside services, even if keys are set on this computer. Each test that
// needs the AI swaps in a pretend one.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEWS_API_KEY;
delete process.env.COMPANIES_HOUSE_API_KEY;
process.env.EMAIL_TRANSPORT = "log";

// Fixed, fake keys so encryption tests do not depend on local settings.
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.SUPPRESSION_HMAC_KEY = Buffer.alloc(32, 9).toString("base64");
