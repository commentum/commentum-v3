# Commentum Backend

Commentum is a high-performance, lightweight backend service designed for discussion threads, nested replies, user voting, and moderation. Built on top of Supabase Edge Functions (Deno) and PostgreSQL, it provides a unified self-referencing hierarchical model optimized for low latency and scalability.

## Core Features

- **Unified Discussion Architecture**: Comments and replies are structured inside a single database table (`posts`) with automatic root tracking and metadata inheritance via PostgreSQL triggers.
- **Episode & Media Filtering**: Support filtering discussions by third-party media IDs (e.g., MyAnimeList, AniList) as well as specific episode numbers.
- **Batched Query Performance**: Eliminates N+1 database bottlenecks during hierarchical reply previews using exact row counting and batched relationship queries.
- **Optimized Authentication**: Single-query joined session and user validation backed by HMAC-SHA256 JWT tokens.
- **Built-in Moderation System**: Automated report tracking, status toggling (`active`, `hidden`, `removed`, `deleted`), rate limiting, and administrative user banning.

---

## Architecture Overview

```
Client App <---> Deno Edge Functions (Supabase) <---> PostgreSQL Database
                        |
            Auth / Rate Limiting / CORS
```

### Database Entities

1. **`users`**: Stores user profiles authenticated via external third-party OAuth providers (`mal`, `anilist`, `simkl`).
2. **`sessions`**: Manages active user sessions with automatic expiration and revocation capabilities.
3. **`posts`**: Self-referencing table storing both root comments and nested replies. Triggers ensure all replies inherit `media_id`, `media_provider`, and `episode_number` from the root ancestor.
4. **`votes`**: Unique constraint table tracking user upvotes (+1) and downvotes (-1), automatically syncing total post scores via database triggers.
5. **`reports`**: Tracks user reports against content, triggering automatic visibility thresholds when report limits are exceeded.

---

## Deployment & Setup

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed and configured.
- A Supabase project initialized.

### 1. Database Initialization

Execute the SQL schema inside your Supabase project SQL Editor or apply via migrations:

```bash
# Apply full schema
cat database/schema.sql | supabase db execute

# Or run subsequent migrations if upgrading an existing deployment
cat database/migrations/002_add_episode_number.sql | supabase db execute
```

### 2. Environment Variables

Set the required environment secrets in your Supabase project:

```bash
supabase secrets set JWT_SECRET="your_secure_random_jwt_secret"
```

*(Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically injected into Edge Functions by the Supabase runtime).*

### 3. Deploy Edge Functions

Deploy all serverless functions to your Supabase project:

```bash
supabase functions deploy
```

---

## Documentation

- **[API Reference](./API_REFERENCE.md)**: Comprehensive specification of endpoints, data schemas, rate limits, and error codes.
- **[Usage Guide](./USAGE.md)**: Real-world integration examples using `cURL` and standard JavaScript/TypeScript Fetch API.

---

## License

MIT License.
