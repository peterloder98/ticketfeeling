# packages/database

This folder is intentionally empty.

Prisma schema, migrations, and seed live under **`apps/web/prisma`**.

Do not add a second database package here — it would break the monorepo workspace assumption (`packages/*`) without a real package. Use:

```bash
npm run db:generate   # prisma generate in apps/web
npm run db:migrate
npm run db:seed
```
