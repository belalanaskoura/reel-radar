// Shared safety net for every script that touches a real Supabase project
// for testing purposes (scripts/stress/*.ts load-tests, scripts/integration/
// *.test.ts integration tests). These scripts seed real rows -- including
// real auth.users accounts -- and, for integration tests, sign in as those
// accounts to exercise real RLS policies. createServiceRoleClient()
// (src/lib/supabase/service-role.ts) and createClient()
// (src/lib/supabase/client.ts) both read the exact same
// NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY/
// SUPABASE_SERVICE_ROLE_KEY every other script and the app itself use, so
// none of them are reused here -- these scripts read a separate
// SUPABASE_TEST_URL/SUPABASE_TEST_ANON_KEY/SUPABASE_TEST_SERVICE_ROLE_KEY
// trio from .env.test.local instead (a file that doesn't exist until you
// create your own dedicated test Supabase project and fill it in; see
// docs/LOAD_TESTING.md and docs/INTEGRATION_TESTING.md), and refuse to run
// at all if that URL happens to match the production one from .env.local.
import fs from 'fs';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function loadEnvFile(relativePath: string): Record<string, string> {
  const fullPath = path.resolve(__dirname, '../..', relativePath);
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

interface TestProjectEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

function loadTestProjectEnv(): TestProjectEnv {
  const testEnv = loadEnvFile('.env.test.local');
  const url = testEnv.SUPABASE_TEST_URL;
  const anonKey = testEnv.SUPABASE_TEST_ANON_KEY;
  const serviceRoleKey = testEnv.SUPABASE_TEST_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY ' +
        'in .env.test.local.\nThis must point at a DEDICATED test Supabase project, never ' +
        'production -- see docs/LOAD_TESTING.md for setup steps. Refusing to run without it.',
    );
  }

  // Belt-and-suspenders: if .env.local (the real production config) is
  // also present and its URL matches the "test" URL, something is
  // misconfigured -- refuse rather than risk running against production.
  const prodEnv = loadEnvFile('.env.local');
  if (prodEnv.NEXT_PUBLIC_SUPABASE_URL && prodEnv.NEXT_PUBLIC_SUPABASE_URL === url) {
    throw new Error(
      'SUPABASE_TEST_URL in .env.test.local is identical to NEXT_PUBLIC_SUPABASE_URL ' +
        'in .env.local (production). Refusing to run against production.',
    );
  }

  return { url, anonKey, serviceRoleKey };
}

// Bypasses RLS entirely -- for seeding/cleanup only, never for exercising
// a policy under test.
export function getTestProjectServiceClient(): SupabaseClient {
  const { url, serviceRoleKey } = loadTestProjectEnv();
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

// A real anon-key client with no session -- RLS applies as it would for a
// signed-out request. Use signInAsTestUser() to get an authenticated one.
export function getTestProjectAnonClient(): SupabaseClient {
  const { url, anonKey } = loadTestProjectEnv();
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

// A real anon-key client signed in as one specific user, so RLS's
// auth.uid() resolves to that user's id for real -- this is the only way
// to actually exercise a policy rather than just reading its SQL text.
export async function signInAsTestUser(email: string, password: string): Promise<SupabaseClient> {
  const client = getTestProjectAnonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Failed to sign in as test user ${email}: ${error.message}`);
  return client;
}
