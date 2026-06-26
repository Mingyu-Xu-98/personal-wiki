# Mac Mini Alpha Deployment

Mac mini is a good target for Personal Wiki Harness alpha and small-scale self-hosting. It is not the final large-scale production architecture, but it is useful for validating the whole platform with real users and real content.

## Recommended Role

Use Mac mini for:

- Studio web app
- Build worker process
- Docker PostgreSQL
- Local artifact storage during alpha
- Cloudflare Tunnel or reverse proxy entrypoint

Keep these outside the Mac mini when traffic grows:

- Object storage for large uploads and generated site artifacts
- CDN
- Email delivery
- Managed backups
- Long-term production PostgreSQL, if availability becomes important

## Suggested Alpha Stack

```text
Mac mini
  Docker PostgreSQL
  Next.js Studio
  Build worker
  Local artifact storage
  Cloudflare Tunnel / reverse proxy

External
  Domain DNS
  Optional R2/S3 object storage
  Optional managed backup target
```

## First Setup

1. Install Docker Desktop.
2. Clone the repository.
3. Copy environment examples.
4. Start PostgreSQL.
5. Start Studio on fixed port 3006.

```sh
git clone <repo-url>
cd personal-wiki-harness
npm install
cp .env.local.example .env.local
npm run db:up
npm run restart:studio
```

## Alpha Environment

Use the Docker database URL:

```text
DATABASE_URL=postgresql://pwh:pwh_local_dev@127.0.0.1:54322/pwh
```

For Mac mini, change the database password before inviting users:

```text
POSTGRES_PASSWORD=<strong-local-password>
DATABASE_URL=postgresql://pwh:<strong-local-password>@127.0.0.1:54322/pwh
```

## Operational Rules

- Keep PostgreSQL bound to `127.0.0.1`; do not expose it directly to the public network.
- Put the web app behind HTTPS.
- Back up the Docker volume before destructive schema resets.
- Keep generated artifacts outside the database once file sizes grow.
- Treat this as alpha infrastructure: acceptable for controlled testing, not high availability.

## Next Engineering Step

The project now has the database schema and Docker runtime. The next step is implementing the database-backed repository adapter so Studio can switch from `.pwh-studio/state.json` to PostgreSQL without changing the UI flow.
