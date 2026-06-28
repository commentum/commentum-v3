# Commentum API Usage Guide

This document provides concrete request and response examples for integrating with the Commentum API. Base URLs follow the format:
`https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1`

---

## Authentication

### 1. Login with OAuth Access Token

Exchange a third-party access token (MyAnimeList, AniList, or Simkl) for a Commentum JWT session token.

#### HTTP Request
```http
POST /auth HTTP/1.1
Content-Type: application/json

{
  "provider": "anilist",
  "access_token": "eyJhbGciOi..."
}
```

#### cURL Example
```bash
curl -X POST "https://your-project.supabase.co/functions/v1/auth" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "anilist",
    "access_token": "your_anilist_access_token"
  }'
```

#### Response (200 OK)
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "c3a8b2e1-4d7a-4f3b-8c1a-9e2d3a4b5c6d",
    "username": "AnimeFan99",
    "role": "user",
    "provider": "anilist"
  }
}
```

---

### 2. Get Current User Profile

Retrieve the profile associated with the provided Authorization header.

#### cURL Example
```bash
curl -X GET "https://your-project.supabase.co/functions/v1/me" \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
```

#### Response (200 OK)
```json
{
  "user": {
    "id": "c3a8b2e1-4d7a-4f3b-8c1a-9e2d3a4b5c6d",
    "username": "AnimeFan99",
    "role": "user",
    "provider": "anilist",
    "avatar_url": "https://s4.anilist.co/file/anilistcdn/user/avatar/large/default.png",
    "created_at": "2026-06-28T12:00:00.000Z"
  }
}
```

---

## Comments and Discussion Threads

### 3. Retrieve Comments for a Media Item (with Episode Filter)

List top-level root comments for a specific media item. You can optionally filter by `episode_number`. If unauthenticated, `user_vote` returns `null`.

#### cURL Example
```bash
curl -X GET "https://your-project.supabase.co/functions/v1/posts?media_id=101922&episode_number=3&limit=20" \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
```

#### Response (200 OK)
```json
{
  "comments": [
    {
      "id": "8f14e45f-eae1-4a3b-9a1b-3c4d5e6f7a8b",
      "client": "shonenx",
      "content": "The animation quality in this episode fight scene was incredible!",
      "score": 24,
      "status": "active",
      "created_at": "2026-06-28T14:30:00.000Z",
      "updated_at": "2026-06-28T14:30:00.000Z",
      "user_id": "c3a8b2e1-4d7a-4f3b-8c1a-9e2d3a4b5c6d",
      "parent_id": null,
      "root_id": "8f14e45f-eae1-4a3b-9a1b-3c4d5e6f7a8b",
      "media_id": "101922",
      "media_provider": "anilist",
      "episode_number": 3,
      "user": {
        "username": "AnimeFan99",
        "avatar_url": "https://..."
      },
      "replies": [
        {
          "id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
          "client": "shonenx",
          "content": "Truly peak fiction.",
          "score": 5,
          "status": "active",
          "created_at": "2026-06-28T14:35:00.000Z",
          "updated_at": "2026-06-28T14:35:00.000Z",
          "user_id": "e1f2a3b4-c5d6-e7f8-a9b0-c1d2e3f4a5b6",
          "parent_id": "8f14e45f-eae1-4a3b-9a1b-3c4d5e6f7a8b",
          "root_id": "8f14e45f-eae1-4a3b-9a1b-3c4d5e6f7a8b",
          "media_id": "101922",
          "media_provider": "anilist",
          "episode_number": 3,
          "user": {
            "username": "SakuraChaser",
            "avatar_url": "https://..."
          },
          "user_vote": 1
        }
      ],
      "has_more_replies": false,
      "replies_count": 1,
      "user_vote": 0
    }
  ],
  "comment_count": 1,
  "next_cursor": null
}
```

---

### 4. Retrieve Full Thread Replies

Retrieve all replies associated with a root comment thread.

#### cURL Example
```bash
curl -X GET "https://your-project.supabase.co/functions/v1/posts?root_id=8f14e45f-eae1-4a3b-9a1b-3c4d5e6f7a8b&limit=50"
```

#### Response (200 OK)
```json
{
  "replies": [
    {
      "id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "client": "shonenx",
      "content": "Truly peak fiction.",
      "score": 5,
      "status": "active",
      "created_at": "2026-06-28T14:35:00.000Z",
      "updated_at": "2026-06-28T14:35:00.000Z",
      "user_id": "e1f2a3b4-c5d6-e7f8-a9b0-c1d2e3f4a5b6",
      "parent_id": "8f14e45f-eae1-4a3b-9a1b-3c4d5e6f7a8b",
      "root_id": "8f14e45f-eae1-4a3b-9a1b-3c4d5e6f7a8b",
      "media_id": "101922",
      "media_provider": "anilist",
      "episode_number": 3,
      "user": {
        "username": "SakuraChaser",
        "avatar_url": "https://..."
      },
      "user_vote": null
    }
  ],
  "reply_count": 1,
  "next_cursor": null
}
```

---

### 5. Post a Root Comment (with Episode Number)

Create a new discussion post attached to a media ID and optional episode number.

#### TypeScript / Fetch API Example
```typescript
const response = await fetch("https://your-project.supabase.co/functions/v1/posts", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    media_id: "101922",
    media_provider: "anilist",
    episode_number: 3,
    content: "The soundtrack during the climax was magnificent.",
    client: "shonenx"
  })
});

const data = await response.json();
```

#### Response (201 Created)
```json
{
  "post": {
    "id": "4b5c6d7e-8f9a-0b1c-2d3e-4f5a6b7c8d9e",
    "client": "shonenx",
    "content": "The soundtrack during the climax was magnificent.",
    "score": 0,
    "status": "active",
    "created_at": "2026-06-28T15:00:00.000Z",
    "updated_at": "2026-06-28T15:00:00.000Z",
    "parent_id": null,
    "root_id": "4b5c6d7e-8f9a-0b1c-2d3e-4f5a6b7c8d9e",
    "media_id": "101922",
    "media_provider": "anilist",
    "episode_number": 3,
    "user": {
      "username": "AnimeFan99",
      "avatar_url": "https://..."
    }
  }
}
```

---

### 6. Post a Reply to an Existing Comment

When posting a reply, you only need to provide the `parent_id` and `content`. The database automatically inherits the `root_id`, `media_id`, `media_provider`, and `episode_number` from the parent post.

#### cURL Example
```bash
curl -X POST "https://your-project.supabase.co/functions/v1/posts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -d '{
    "parent_id": "8f14e45f-eae1-4a3b-9a1b-3c4d5e6f7a8b",
    "content": "Agreed! Best episode of the season.",
    "client": "shonenx"
  }'
```

#### Response (201 Created)
```json
{
  "post": {
    "id": "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
    "client": "shonenx",
    "content": "Agreed! Best episode of the season.",
    "score": 0,
    "status": "active",
    "created_at": "2026-06-28T15:05:00.000Z",
    "updated_at": "2026-06-28T15:05:00.000Z",
    "parent_id": "8f14e45f-eae1-4a3b-9a1b-3c4d5e6f7a8b",
    "root_id": "8f14e45f-eae1-4a3b-9a1b-3c4d5e6f7a8b",
    "media_id": "101922",
    "media_provider": "anilist",
    "episode_number": 3,
    "user": {
      "username": "AnimeFan99",
      "avatar_url": "https://..."
    }
  }
}
```

---

## Voting & Moderation

### 7. Submit a Vote

Toggle or cast a vote on any post. Sending the same `vote_type` twice removes the vote.

#### cURL Example
```bash
curl -X POST "https://your-project.supabase.co/functions/v1/votes" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -d '{
    "post_id": "8f14e45f-eae1-4a3b-9a1b-3c4d5e6f7a8b",
    "vote_type": 1
  }'
```

#### Response (200 OK)
```json
{
  "post_id": "8f14e45f-eae1-4a3b-9a1b-3c4d5e6f7a8b",
  "score": 25
}
```

---

### 8. Report Content

Submit a moderation report. If an active post accumulates 5 or more unresolved reports, its status automatically transitions to `hidden`.

#### cURL Example
```bash
curl -X POST "https://your-project.supabase.co/functions/v1/reports" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -d '{
    "post_id": "8f14e45f-eae1-4a3b-9a1b-3c4d5e6f7a8b",
    "reason": "Spoilers without appropriate tag"
  }'
```

#### Response (201 Created)
```json
{
  "message": "Report submitted"
}
```
