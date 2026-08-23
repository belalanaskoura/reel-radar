import type { SupabaseClient, User } from '@supabase/supabase-js';

// supabase.auth.admin.listUsers() defaults to 50 users per page with no
// sort order exposed to the caller to guarantee which 50 come back --
// calling it with no arguments silently scans only an arbitrary slice
// of the real user base once it grows past 50, with no error thrown to
// ever reveal it (confirmed as a real bug in /api/welcome-email; this
// helper is the fix, shared so it can't recur at each call site
// individually). Walks every page via the response's own `nextPage`
// field until exhausted.
export async function listAllUsers(supabase: SupabaseClient): Promise<User[]> {
  const allUsers: User[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    allUsers.push(...data.users);
    if (!data.nextPage) break;
    page = data.nextPage;
  }
  return allUsers;
}
