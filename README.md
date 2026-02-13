# Commentum API

Lightweight comment system with replies, voting, and moderation. Supabase Edge Functions + PostgreSQL.

## Setup

### 1. app/.env (Only for testing with web app)
```bash
# AniList OAuth Configuration
# Get these from https://anilist.co/settings/developer
NEXT_PUBLIC_ANILIST_CLIENT_ID=your_anilist_client_id
ANILIST_CLIENT_SECRET=your_anilist_client_secret
NEXT_PUBLIC_ANILIST_REDIRECT_URI=http://localhost:3000

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:54321/functions/v1

# Environment
NODE_ENV=development
```

### 2. Database (Required)
```bash
# Copy & run database/schema.sql in Supabase SQL Editor
```

### 3. Deploy (Required)
```bash
# Deploy the edge functions
supabase functions deploy
# Only for testing with web app
npm install && npm run dev
```

---

## Documentation

- [API_REFERENCE](./API_REFERENCE.md) - Full API endpoints & responses
- [USAGE](./USAGE.md) - Real curl examples for every endpoint


---