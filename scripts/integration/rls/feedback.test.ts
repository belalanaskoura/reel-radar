// Real RLS integration test for feedback -- the interesting case here is
// that this table has an INSERT policy but genuinely NO select policy at
// all (deliberate, per CLAUDE.md: "mirrors notification_log's [...] no
// read policy at all"). RLS defaults to deny when no policy matches an
// operation, so this should mean nobody -- not even the user who
// submitted it -- can read feedback back through the anon-key/RLS path.
// That's a real, easy-to-get-backwards invariant (a missing policy is
// invisible in code review the way a wrong policy isn't), worth a test
// that actually proves it holds. See docs/INTEGRATION_TESTING.md.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestUser, deleteTestUser, type TestUser } from '../_lib/fixtures';

describe('feedback RLS', () => {
  let userA: TestUser;

  beforeAll(async () => {
    userA = await createTestUser();
  });

  // Deleting the user cascades to their feedback row (ON DELETE CASCADE),
  // so no separate feedback cleanup is needed -- and none is possible
  // through RLS anyway, since there's no select policy to read an id back
  // through the signed-in client, and using the service-role client just
  // to delete a row the user-scoped test itself couldn't read would be
  // redundant with this cascade.
  afterAll(async () => {
    await deleteTestUser(userA?.id);
  });

  it('lets an authenticated user submit their own feedback', async () => {
    const { error } = await userA.client
      .from('feedback')
      .insert({ user_id: userA.id, email: userA.email, message: 'Integration test feedback' });
    expect(error).toBeNull();
  });

  it('blocks submitting feedback on someone else\'s behalf', async () => {
    const other = await createTestUser();
    try {
      const { error } = await other.client
        .from('feedback')
        .insert({ user_id: userA.id, email: userA.email, message: 'Spoofed feedback' });
      expect(error).not.toBeNull();
    } finally {
      await deleteTestUser(other.id);
    }
  });

  it('blocks the submitting user from reading their own feedback back (no select policy at all)', async () => {
    const { data, error } = await userA.client.from('feedback').select('id').eq('user_id', userA.id);
    // No exception thrown -- RLS silently returns zero rows for an
    // operation with no matching policy, same as every other "deny"
    // case in this suite. This is the behavior to guard, specifically
    // because it's easy for a future policy addition to accidentally
    // change without anyone noticing in code review.
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
