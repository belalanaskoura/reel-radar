// Real RLS + real constraint integration test. notification_log has a
// genuinely more complex shape than watchlist: a service-role-only insert
// path (users never insert their own notification rows -- the app's
// server-side notify functions do, via createServiceRoleClient), a
// user-updatable read_at column, real partial unique indexes, and a real
// CHECK constraint on kind. CLAUDE.md's own history records a real
// production bug where a value outside that CHECK constraint's allowed
// list was silently rejected and swallowed by a best-effort catch{} --
// this file exists so that class of bug gets caught by a test next time,
// not by a live production run. See docs/INTEGRATION_TESTING.md for setup.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestMovie,
  createTestUser,
  deleteTestMovie,
  deleteTestUser,
  type TestUser,
} from '../_lib/fixtures';
import { getTestProjectServiceClient } from '../../_lib/test-project-client';

describe('notification_log RLS and constraints', () => {
  let userA: TestUser;
  let userB: TestUser;
  let movieId: string;

  beforeAll(async () => {
    [userA, userB, movieId] = await Promise.all([createTestUser(), createTestUser(), createTestMovie()]);
  });

  afterAll(async () => {
    await Promise.all([deleteTestUser(userA?.id), deleteTestUser(userB?.id), deleteTestMovie(movieId)]);
  });

  it('rejects a kind value outside the CHECK constraint\'s allowed list', async () => {
    const service = getTestProjectServiceClient();
    const { error } = await service.from('notification_log').insert({
      user_id: userA.id,
      movie_id: movieId,
      kind: 'not_a_real_kind',
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/notification_log_kind_check|check constraint/i);
  });

  it('accepts every kind the app actually writes', async () => {
    const service = getTestProjectServiceClient();
    const kinds = ['showtime', 'new_release', 'lineup_added', 'lineup_removed'] as const;
    for (const kind of kinds) {
      const { error } = await service.from('notification_log').insert({
        user_id: userA.id,
        movie_id: movieId,
        kind,
        branch_id: null,
      });
      expect(error, `kind=${kind} should be accepted`).toBeNull();
    }
    await service.from('notification_log').delete().eq('user_id', userA.id).eq('movie_id', movieId);
  });

  it('enforces the partial unique index on (user_id, movie_id) for new_release kind', async () => {
    const service = getTestProjectServiceClient();
    const first = await service
      .from('notification_log')
      .insert({ user_id: userA.id, movie_id: movieId, kind: 'new_release' });
    expect(first.error).toBeNull();

    const duplicate = await service
      .from('notification_log')
      .insert({ user_id: userA.id, movie_id: movieId, kind: 'new_release' });
    expect(duplicate.error).not.toBeNull();
    expect(duplicate.error?.code).toBe('23505');

    await service.from('notification_log').delete().eq('user_id', userA.id).eq('movie_id', movieId);
  });

  it('blocks a user from inserting their own notification_log row directly (service-role-only path)', async () => {
    const { error } = await userA.client
      .from('notification_log')
      .insert({ user_id: userA.id, movie_id: movieId, kind: 'showtime' });
    expect(error).not.toBeNull();
  });

  it('only shows a user their own notification_log rows', async () => {
    const service = getTestProjectServiceClient();
    await service.from('notification_log').insert({ user_id: userA.id, movie_id: movieId, kind: 'showtime' });

    const { data: ownRows } = await userA.client.from('notification_log').select('id').eq('movie_id', movieId);
    expect(ownRows?.length).toBeGreaterThan(0);

    const { data: otherRows } = await userB.client.from('notification_log').select('id').eq('movie_id', movieId);
    expect(otherRows).toHaveLength(0);

    await service.from('notification_log').delete().eq('user_id', userA.id).eq('movie_id', movieId);
  });

  it('lets a user mark their own notification read, but not another user\'s', async () => {
    const service = getTestProjectServiceClient();
    const { data: inserted } = await service
      .from('notification_log')
      .insert({ user_id: userA.id, movie_id: movieId, kind: 'showtime' })
      .select('id')
      .single();
    expect(inserted).not.toBeNull();
    const notificationId = inserted!.id;

    const otherAttempt = await userB.client
      .from('notification_log')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .select('id');
    expect(otherAttempt.data).toHaveLength(0);

    const ownAttempt = await userA.client
      .from('notification_log')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .select('id');
    expect(ownAttempt.data).toHaveLength(1);

    await service.from('notification_log').delete().eq('id', notificationId);
  });
});
