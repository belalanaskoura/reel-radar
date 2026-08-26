// Real RLS integration test for push_subscriptions. Same single `for all`
// policy shape as cinema_follows, but this table also has a real unique
// constraint on (user_id, endpoint) -- worth verifying it's scoped per
// user, not globally unique on endpoint alone, since two different real
// users could theoretically end up with colliding push endpoints in a
// pathological case and the app must not accidentally block that.
// See docs/INTEGRATION_TESTING.md.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestUser, deleteTestUser, type TestUser } from '../_lib/fixtures';

describe('push_subscriptions RLS', () => {
  let userA: TestUser;
  let userB: TestUser;
  const endpoint = `https://example.invalid/push/${Date.now()}`;

  beforeAll(async () => {
    [userA, userB] = await Promise.all([createTestUser(), createTestUser()]);
  });

  afterAll(async () => {
    await Promise.all([deleteTestUser(userA?.id), deleteTestUser(userB?.id)]);
  });

  it('lets a user create their own push subscription', async () => {
    const { error } = await userA.client
      .from('push_subscriptions')
      .insert({ user_id: userA.id, endpoint, p256dh: 'test-p256dh', auth: 'test-auth' });
    expect(error).toBeNull();
  });

  it('blocks creating a subscription on someone else\'s behalf', async () => {
    const { error } = await userB.client
      .from('push_subscriptions')
      .insert({ user_id: userA.id, endpoint: `${endpoint}-other`, p256dh: 'x', auth: 'y' });
    expect(error).not.toBeNull();
  });

  it('only shows a user their own subscriptions', async () => {
    const { data: ownRows } = await userA.client.from('push_subscriptions').select('id').eq('endpoint', endpoint);
    expect(ownRows).toHaveLength(1);

    const { data: otherRows } = await userB.client.from('push_subscriptions').select('id').eq('endpoint', endpoint);
    expect(otherRows).toHaveLength(0);
  });

  it('scopes the (user_id, endpoint) unique constraint per user, not globally', async () => {
    // Same literal endpoint string, different user -- must succeed, since
    // the constraint is on the (user_id, endpoint) pair, not endpoint alone.
    const { error } = await userB.client
      .from('push_subscriptions')
      .insert({ user_id: userB.id, endpoint, p256dh: 'test-p256dh-b', auth: 'test-auth-b' });
    expect(error).toBeNull();
  });

  it('rejects a real duplicate: same user, same endpoint', async () => {
    const { error } = await userA.client
      .from('push_subscriptions')
      .insert({ user_id: userA.id, endpoint, p256dh: 'different-key', auth: 'different-auth' });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('23505');
  });

  it('lets a user delete their own subscription', async () => {
    const { error, count } = await userA.client
      .from('push_subscriptions')
      .delete({ count: 'exact' })
      .eq('user_id', userA.id)
      .eq('endpoint', endpoint);
    expect(error).toBeNull();
    expect(count).toBe(1);
  });
});
