import pg from "pg";

/**
 * `pg` parses `date`/`timestamptz` columns into native JS `Date` objects by
 * default, even though every DTO in this codebase types them as `string`
 * (spec 18절: "시간: ISO 8601 UTC 응답"). A raw `Date` rendered directly in
 * JSX crashes with "Objects are not valid as a React child" -- found via
 * live testing (S03/S05 render `target_filing_date` without formatting).
 *
 * date (OID 1082): Postgres's text wire format is already `YYYY-MM-DD`, so
 * returning it as-is avoids any timezone-shift risk from round-tripping
 * through `new Date()`.
 *
 * timestamptz (OID 1184): normalized to a proper ISO 8601 string, since
 * Postgres's text format ("2026-09-11 00:00:00+00") uses a space separator
 * and a 2-digit offset, not the `T...Z` shape the spec requires.
 *
 * This mutates the module-global `pg.types` registry (not scoped to one
 * Pool), which is fine here since this app is the only `pg` consumer in the
 * process -- imported once for its side effect wherever a Pool/Client is
 * created (packages/db/src/client.ts, migrate-cli.ts).
 */
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value) => new Date(value).toISOString());
