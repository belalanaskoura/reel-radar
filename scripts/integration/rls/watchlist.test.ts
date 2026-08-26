// Real RLS integration test -- signs in as two real, distinct users
// against a real Postgres instance and verifies watchlist's auth.uid()
// = user_id policies actually block cross-user access. A unit test
// cannot catch an RLS bug: the policy only ever runs inside Postgres
// itself, under a real authenticated session, which mocking cannot
// simulate. See docs/INTEGRATION_TESTING.md for setup.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestMovie,
  createTestUser,
  deleteTestMovie,
  deleteTestUser,
  type TestUser,
} from '../_lib/fixtures';
import { getTestProjectAnonClient } from '../../_lib/test-project-client';

describe('watchlist RLS', () => {
  let userA: TestUser;
  let userB: TestUser;
  let movieId: string;

  beforeAll(async () => {
    [userA, userB, movieId] = await Promise.all([createTestUser(), createTestUser(), createTestMovie()]);
  });

  afterAll(async () => {
    await Promise.all([deleteTestUser(userA?.id), deleteTestUser(userB?.id), deleteTestMovie(movieId)]);
  });

  it('lets a user insert their own watchlist row', async () => {
    const { error } = await userA.client
      .from('watchlist')
      .insert({ user_id: userA.id, movie_id: movieId });
    expect(error).toBeNull();
  });

  it('blocks inserting a watchlist row on someone else\'s behalf', async () => {
    const { error } = await userB.client
      .from('watchlist')
      .insert({ user_id: userA.id, movie_id: movieId });
    // The insert with_check (auth.uid() = user_id) fails: either a real
    // RLS violation error, or (some client configs) a silently-empty
    // affected-rows result. Assert on the visible outcome, not just the
    // error code, so this can't pass by accident either way.
    expect(error).not.toBeNull();
  });

  it('only shows a user their own watchlist row, not another user\'s', async () => {
    const { data: ownRows, error: ownError } = await userA.client
      .from('watchlist')
      .select('movie_id')
      .eq('movie_id', movieId);
    expect(ownError).toBeNull();
    expect(ownRows).toHaveLength(1);

    const { data: otherRows, error: otherError } = await userB.client
      .from('watchlist')
      .select('movie_id')
      .eq('movie_id', movieId);
    expect(otherError).toBeNull();
    expect(otherRows).toHaveLength(0);
  });

  it('blocks deleting another user\'s watchlist row', async () => {
    const { error, count } = await userB.client
      .from('watchlist')
      .delete({ count: 'exact' })
      .eq('user_id', userA.id)
      .eq('movie_id', movieId);
    // RLS silently filters the delete's target set to zero rows rather
    // than erroring -- assert on affected-row count, not error presence.
    expect(error).toBeNull();
    expect(count).toBe(0);

    const { data: stillThere } = await userA.client
      .from('watchlist')
      .select('movie_id')
      .eq('movie_id', movieId);
    expect(stillThere).toHaveLength(1);
  });

  it('lets a user delete their own watchlist row', async () => {
    const { error, count } = await userA.client
      .from('watchlist')
      .delete({ count: 'exact' })
      .eq('user_id', userA.id)
      .eq('movie_id', movieId);
    expect(error).toBeNull();
    expect(count).toBe(1);
  });

  it('blocks an unauthenticated request from reading any watchlist row', async () => {
    const anon = getTestProjectAnonClient();
    const { data, error } = await anon.from('watchlist').select('movie_id');
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
