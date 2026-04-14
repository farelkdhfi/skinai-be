/**
 * Preload script to load environment variables before ES modules
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend root (parent of src/)
const envPath = resolve(__dirname, '..', '.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('❌ Failed to load .env file:', result.error.message);
} else {
    console.log('✅ Environment variables loaded from:', envPath);
}
