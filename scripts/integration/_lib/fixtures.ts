// Shared setup/teardown for RLS integration tests: creates real throwaway
// auth.users accounts (via the service-role admin API) and real signed-in
// anon-key sessions for them, since RLS's auth.uid() only resolves to a
// real value inside a real authenticated session -- there is no way to
// fake this with the service-role client, which bypasses RLS entirely.
import {
  getTestProjectServiceClient,
  signInAsTestUser,
} from '../../_lib/test-project-client';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

const RUN_TAG = `inttest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let userCounter = 0;

// Creates a real user and returns a real signed-in client for them.
export async function createTestUser(): Promise<TestUser> {
  const service = getTestProjectServiceClient();
  const email = `${RUN_TAG}-user-${userCounter++}@example.invalid`;
  const password = crypto.randomUUID();

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create test user ${email}: ${error?.message}`);
  }

  const client = await signInAsTestUser(email, password);
  return { id: data.user.id, email, client };
}

// Deletes a test user (cascades to every row referencing them via
// ON DELETE CASCADE FKs -- watchlist, notification_log, cinema_follows,
// push_subscriptions, feedback, profiles).
//
// Every delete* helper below accepts undefined/empty and no-ops: when
// beforeAll throws (e.g. .env.test.local isn't configured yet), the
// corresponding create* call never ran, so the id passed to afterAll's
// cleanup is undefined -- without this, that's a second, more confusing
// crash on top of the real "missing test project config" error.
export async function deleteTestUser(userId: string | undefined): Promise<void> {
  if (!userId) return;
  const service = getTestProjectServiceClient();
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) console.error(`Cleanup warning: failed to delete test user ${userId}: ${error.message}`);
}

// Seeds one throwaway movie row (no auth.users FK, so this doesn't need a
// test user) for tests that need a real movie_id to satisfy watchlist/
// notification_log's FK to movies.
export async function createTestMovie(): Promise<string> {
  const service = getTestProjectServiceClient();
  const title = `${RUN_TAG} Movie ${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await service
    .from('movies')
    .insert({ title, normalized_title: title.toLowerCase(), match_status: 'matched' })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Failed to seed test movie: ${error?.message}`);
  return data.id;
}

export async function deleteTestMovie(movieId: string | undefined): Promise<void> {
  if (!movieId) return;
  const service = getTestProjectServiceClient();
  const { error } = await service.from('movies').delete().eq('id', movieId);
  if (error) console.error(`Cleanup warning: failed to delete test movie ${movieId}: ${error.message}`);
}

// Seeds one throwaway branch row (needed for cinema_follows' FK to
// branches, and showtimes_cache/notification_log's branch_id FK).
export async function createTestBranch(): Promise<string> {
  const service = getTestProjectServiceClient();
  const id = `${RUN_TAG}-branch-${Math.random().toString(36).slice(2, 8)}`;
  const { error } = await service
    .from('branches')
    .insert({ id, name: 'Integration Test Branch', base_url: 'https://example.invalid', chain: 'scene' });
  if (error) throw new Error(`Failed to seed test branch: ${error.message}`);
  return id;
}

export async function deleteTestBranch(branchId: string | undefined): Promise<void> {
  if (!branchId) return;
  const service = getTestProjectServiceClient();
  const { error } = await service.from('branches').delete().eq('id', branchId);
  if (error) console.error(`Cleanup warning: failed to delete test branch ${branchId}: ${error.message}`);
}
