## Summary

<!-- What + why, 1-3 bullets -->

## Spec reference

<!-- vault://... path or ADR-### -->

## Test plan

- [ ] `bun test` green
- [ ] `bun typecheck` clean
- [ ] `bun lint` clean
- [ ] Integration tests (if Redis/Postgres touched): `BUN_TEST_REDIS=... bun test`

## Checklist

- [ ] Conventional commit message
- [ ] TDD: test existed and failed first (per ADR-014)
- [ ] No new dep without checking Bun native equivalent
- [ ] Vault updated if spec changed
