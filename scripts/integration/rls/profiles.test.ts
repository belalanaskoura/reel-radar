// Real RLS integration test for profiles. Different shape again: rows are
// created by the handle_new_user trigger on real signup (per CLAUDE.md's
// Phase 3 notes), not by the app inserting directly, so there's no insert
// policy to test -- only select own / update own. Verifies the trigger
// actually fires (a real signup produces a real profiles row) and that
// RLS blocks reading/updating another user's profile.
// See docs/INTEGRATION_TESTING.md.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestUser, deleteTestUser, type TestUser } from '../_lib/fixtures';

describe('profiles RLS', () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    [userA, userB] = await Promise.all([createTestUser(), createTestUser()]);
  });

  afterAll(async () => {
    await Promise.all([deleteTestUser(userA?.id), deleteTestUser(userB?.id)]);
  });

  it('creates a real profiles row via the handle_new_user trigger on signup', async () => {
    const { data, error } = await userA.client.from('profiles').select('id').eq('id', userA.id).single();
    expect(error).toBeNull();
    expect(data?.id).toBe(userA.id);
  });

  it('blocks reading another user\'s profile', async () => {
    const { data } = await userA.client.from('profiles').select('id').eq('id', userB.id);
    expect(data).toHaveLength(0);
  });

  it('lets a user update their own profile', async () => {
    const { error } = await userA.client
      .from('profiles')
      .update({ display_name: 'Integration Test User' })
      .eq('id', userA.id);
    expect(error).toBeNull();

    const { data } = await userA.client.from('profiles').select('display_name').eq('id', userA.id).single();
    expect(data?.display_name).toBe('Integration Test User');
  });

  it('blocks updating another user\'s profile', async () => {
    const { data: before } = await userA.client
      .from('profiles')
      .select('display_name')
      .eq('id', userA.id)
      .single();

    const { count } = await userB.client
      .from('profiles')
      .update({ display_name: 'Hijacked' }, { count: 'exact' })
      .eq('id', userA.id);
    expect(count).toBe(0);

    // Confirm the value truly didn't change, not just that the affected
    // count happened to read as zero.
    const { data: after } = await userA.client.from('profiles').select('display_name').eq('id', userA.id).single();
    expect(after?.display_name).toBe(before?.display_name);
  });
});
