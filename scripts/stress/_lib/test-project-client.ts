// Shared safety net for every real-Supabase load/stress script in this
// directory. These scripts seed synthetic rows at real scale (thousands of
// movies/showtimes_cache rows, or real auth.users rows for FK-bound tables)
// and run concurrent write bursts -- the opposite of what should ever touch
// production. createServiceRoleClient() (src/lib/supabase/service-role.ts)
// reads the exact same NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
// every other script and the app itself use, so it is deliberately NOT
// reused here -- these scripts read a separate SUPABASE_TEST_URL/
// SUPABASE_TEST_SERVICE_ROLE_KEY pair from .env.test.local instead (a file
// that doesn't exist until you create your own dedicated test Supabase
// project and fill it in; see docs/LOAD_TESTING.md), and refuse to run at
// all if that URL happens to match the production one from .env.local.
import fs from 'fs';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function loadEnvFile(relativePath: string): Record<string, string> {
  const fullPath = path.resolve(__dirname, '../../..', relativePath);
  const values: Record<string, string> = {};
  if (!fs.existsSync(fullPath)) return values;

  fs.readFileSync(fullPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const [k, ...v] = line.split('=');
      if (k && k.trim()) values[k.trim()] = v.join('=').trim();
    });
  return values;
}

export function getTestProjectClient(): SupabaseClient {
  const testEnv = loadEnvFile('.env.test.local');
  const testUrl = testEnv.SUPABASE_TEST_URL;
  const testKey = testEnv.SUPABASE_TEST_SERVICE_ROLE_KEY;

  if (!testUrl || !testKey) {
    throw new Error(
      'Missing SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY in .env.test.local.\n' +
        'This must point at a DEDICATED test Supabase project, never production -- ' +
        'see docs/LOAD_TESTING.md for setup steps. Refusing to run without it.',
    );
  }

  // Belt-and-suspenders: if .env.local (the real production config) is
  // also present and its URL matches the "test" URL, something is
  // misconfigured -- refuse rather than risk seeding/load-testing
  // production data.
  const prodEnv = loadEnvFile('.env.local');
  if (prodEnv.NEXT_PUBLIC_SUPABASE_URL && prodEnv.NEXT_PUBLIC_SUPABASE_URL === testUrl) {
    throw new Error(
      'SUPABASE_TEST_URL in .env.test.local is identical to NEXT_PUBLIC_SUPABASE_URL ' +
        'in .env.local (production). Refusing to run a load/stress test against production.',
    );
  }

  return createClient(testUrl, testKey, { auth: { persistSession: false } });
}
