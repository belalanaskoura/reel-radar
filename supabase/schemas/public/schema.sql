comment on schema "public" is 'standard public schema';

revoke all on schema "public" from public;

grant usage on schema "public" to public;

revoke all on schema "public" from "anon";

grant usage on schema "public" to "anon";

revoke all on schema "public" from "authenticated";

grant usage on schema "public" to "authenticated";

revoke all on schema "public" from "pg_database_owner";

grant create, usage on schema "public" to "pg_database_owner";

revoke all on schema "public" from "postgres";

grant usage on schema "public" to "postgres";

revoke all on schema "public" from "service_role";

grant usage on schema "public" to "service_role";
