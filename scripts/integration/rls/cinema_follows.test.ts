// Real RLS integration test for cinema_follows -- a single `for all`
// policy (using (auth.uid() = user_id), with check (auth.uid() = user_id))
// covering select/insert/update/delete in one clause, unlike watchlist's
// four separate per-operation policies. Worth testing independently since
// a single combined policy is a different real SQL shape, not just a
// smaller version of the same test. See docs/INTEGRATION_TESTING.md.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestBranch,
  createTestUser,
  deleteTestBranch,
  deleteTestUser,
  type TestUser,
} from '../_lib/fixtures';

describe('cinema_follows RLS', () => {
  let userA: TestUser;
  let userB: TestUser;
  let branchId: string;

  beforeAll(async () => {
    [userA, userB, branchId] = await Promise.all([createTestUser(), createTestUser(), createTestBranch()]);
  });

  afterAll(async () => {
    await Promise.all([deleteTestUser(userA?.id), deleteTestUser(userB?.id), deleteTestBranch(branchId)]);
  });

  it('lets a user follow a cinema for themselves', async () => {
    const { error } = await userA.client.from('cinema_follows').insert({ user_id: userA.id, branch_id: branchId });
    expect(error).toBeNull();
  });

  it('blocks following a cinema on someone else\'s behalf', async () => {
    const { error } = await userB.client.from('cinema_follows').insert({ user_id: userA.id, branch_id: branchId });
    expect(error).not.toBeNull();
  });

  it('only shows a user their own follow, not another user\'s', async () => {
    const { data: ownRows } = await userA.client.from('cinema_follows').select('branch_id').eq('branch_id', branchId);
    expect(ownRows).toHaveLength(1);

    const { data: otherRows } = await userB.client.from('cinema_follows').select('branch_id').eq('branch_id', branchId);
    expect(otherRows).toHaveLength(0);
  });

  it('blocks unfollowing on someone else\'s behalf', async () => {
    const { count } = await userB.client
      .from('cinema_follows')
      .delete({ count: 'exact' })
      .eq('user_id', userA.id)
      .eq('branch_id', branchId);
    expect(count).toBe(0);
  });

  it('lets a user unfollow their own tracked cinema', async () => {
    const { error, count } = await userA.client
      .from('cinema_follows')
      .delete({ count: 'exact' })
      .eq('user_id', userA.id)
      .eq('branch_id', branchId);
    expect(error).toBeNull();
    expect(count).toBe(1);
  });
});
