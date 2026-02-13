# Commentum API Reference

## Overview

**Base URL:** `https://<PROJECT_REF>.supabase.co/functions/v1`

**Authentication:** Protected endpoints require `Authorization: Bearer <JWT_TOKEN>`

Get your JWT token from the `/auth` endpoint.

**All responses** use the format: `{ "data": ... }` on success or `{ "error": "..." }` on failure.

---

## Database Architecture

The API uses a **unified posts model**:
- All comments and replies are stored in a single `posts` table with self-referencing hierarchy
- **Root posts** (comments): `parent_id = NULL`, `media_id = <set>`, `root_id = self`
- **Top-level replies**: `parent_id = <root post UUID>`, `media_id = NULL`, `root_id = <root post UUID>`
- **Nested replies**: `parent_id = <other reply UUID>`, `media_id = NULL`, `root_id = <original root UUID>`
- `root_id` automatically assigned by trigger for hierarchical queries
- All voting uses a unified `votes` table (replaces separate comment_votes/reply_votes tables)

---

## Auth

<details>
<summary><strong>POST /auth</strong> - Login</summary>

Login with a provider access token.

**Limits:** 10 req/min per IP

Request:
```json
{
  "provider": "mal | anilist | simkl",
  "access_token": "provider_token"
}
```

Response (200):
```json
{
  "token": "jwt_token",
  "user": {
    "id": "uuid",
    "username": "user",
    "role": "user",
    "provider": "mal"
  }
}
```

</details>

<details>
<summary><strong>DELETE /auth</strong> - Logout</summary>

Revoke current session.

Request Headers:
`Authorization: Bearer <token>`

Response (200):
```json
{
  "message": "Logged out successfully"
}
```

</details>

<details>
<summary><strong>GET /me</strong> - Get Profile</summary>

Get current user profile.

Request Headers:
`Authorization: Bearer <token>`

Response (200):
```json
{
  "user": {
    "id": "uuid",
    "username": "username",
    "role": "user",
    "provider": "anilist",
    "avatar_url": "https://...",
    "created_at": "2026-02-12T..."
  }
}
```

</details>

---

## Posts Management

<details>
<summary><strong>POST /posts</strong> (Protected) - Create</summary>

Create a comment (root post) or a reply.

**Limits:** 500 chars | 5 req/min per user (root) | 10 req/min (reply)

**Request (Create Comment):**
```json
{
  "media_id": "anime-123",
  "content": "Great anime!"
}
```

**Request (Create Reply):**
```json
{
  "parent_id": "uuid (post id to reply to)",
  "content": "I agree!"
}
```

Response (201):
```json
{
  "post": {
    "id": "uuid",
    "content": "Great anime!",
    "score": 0,
    "status": "active",
    "parent_id": null, // or uuid if reply
    "root_id": "uuid", // auto-assigned
    "media_id": "anime-123", // or null if reply
    "created_at": "2026-02-12T...",
    "updated_at": "2026-02-12T..."
  }
}
```

</details>

<details>
<summary><strong>PATCH /posts</strong> (Protected) - Update</summary>

Update your own post (comment or reply).

**Limits:** 10 req/min per user

Request:
```json
{
  "id": "uuid",
  "content": "Updated content"
}
```

Response (200):
```json
{
  "post": {
    "id": "uuid",
    "content": "Updated content",
    "score": 5,
    "status": "active",
    "updated_at": "2026-02-12T..."
  }
}
```

</details>

<details>
<summary><strong>DELETE /posts</strong> (Protected) - Delete</summary>

Delete your own post (soft delete).

**Limits:** 10 req/min per user

**Request:**
Query param `?id=uuid` OR body:
```json
{
  "id": "uuid"
}
```

Response (200):
```json
{
  "post": {
    "id": "uuid",
    "status": "deleted",
    "updated_at": "2026-02-12T..."
  }
}
```

</details>

<details>
<summary><strong>GET /posts</strong> - List</summary>

Get comments (with reply previews) or replies.

**Query Params:**
- `media_id`: List root comments for a media.
- `root_id`: List replies for a root post.
- `parent_id`: List replies for a direct parent (nested).
- `limit` (optional, default 20, max 100)
- `cursor` (optional) - ISO timestamp for pagination

*Note: One of `media_id`, `root_id`, or `parent_id` is required.*

If authenticated, includes `user_vote` field.

Response (200 - Comments):
```json
{
  "comments": [
    {
      "id": "uuid",
      "content": "Great anime!",
      "score": 5,
      "status": "active",
      "username": "john_doe",
      "replies": [ ... ],
      "has_more_replies": false,
      "replies_count": 1,
      "user_vote": 1
    }
  ],
  "next_cursor": "..."
}
```

Response (200 - Replies):
```json
{
  "replies": [
    {
      "id": "uuid",
      "content": "I agree!",
      "score": 2,
      ...
    }
  ],
  "next_cursor": "..."
}
```

</details>

<details>
<summary><strong>POST /votes</strong> (Protected)</summary>

Vote on a post (comment or reply).

**Limits:** 30 req/min per user

Request:
```json
{
  "post_id": "uuid",
  "vote_type": 1
}
```

`vote_type`: `1` (upvote) or `-1` (downvote)

Response (200):
```json
{
  "post_id": "uuid",
  "score": 6
}
```

</details>

<details>
<summary><strong>POST /reports</strong> (Protected)</summary>

Report a post. Auto-hides at 5+ unresolved reports.

**Limits:** 5 req/min per user

Request:
```json
{
  "post_id": "uuid",
  "reason": "Spam"
}
```

Response (201):
```json
{
  "message": "Report submitted"
}
```

</details>

---

## Moderation

<details>
<summary><strong>GET /moderation-reports</strong> (Moderator+)</summary>

List unresolved reports.

**Query Params:**
- `limit` (optional, default 20, max 100)
- `offset` (optional, default 0)

Response (200):
```json
{
  "reports": [
    {
      "id": "uuid",
      "reason": "Spam",
      "comment_id": "uuid",
      "comment_content": "Buy cheap...",
      "comment_status": "active",
      "comment_author": "spammer",
      "reporter": "user123",
      "created_at": "2026-02-12T..."
    }
  ]
}
```

</details>

<details>
<summary><strong>POST /moderation-comment-status</strong> (Moderator+)</summary>

Change comment status.

Request:
```json
{
  "comment_id": "uuid",
  "status": "hidden"
}
```

Allowed statuses: `active` | `hidden` | `removed`

Response (200):
```json
{
  "comment": {
    "id": "uuid",
    "status": "hidden",
    "updated_at": "2026-02-12T..."
  }
}
```

</details>

<details>
<summary><strong>POST /moderation-ban-user</strong> (Admin)</summary>

Ban a user.

Request:
```json
{
  "user_id": "uuid"
}
```

Response (200):
```json
{
  "message": "User username has been banned",
  "user": {
    "id": "uuid",
    "username": "username",
    "is_banned": true
  }
}
```

</details>

---

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad request / validation error |
| 401 | Unauthorized / invalid token |
| 403 | Forbidden / insufficient role |
| 404 | Resource not found |
| 405 | Method not allowed |
| 429 | Rate limited |
| 500 | Server error |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `/auth` | 10/min per IP |
| `/posts` (Create Comment) | 5/min per user |
| `/posts` (Create Reply) | 10/min per user |
| `/posts` (Update/Delete) | 10/min per user |
| `/votes` | 30/min per user |
| `/reports` | 5/min per user |

---

## Data Structures

**Comment:**
```json
{
  "id": "uuid",
  "content": "string (1-500 chars)",
  "score": "number",
  "status": "active | hidden | removed | deleted",
  "username": "string",
  "avatar_url": "string | null",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp",
  "replies": "Reply[]",
  "has_more_replies": "boolean",
  "replies_count": "number",
  "user_vote": "1 | -1 | null (if authenticated)"
}
```

**Reply:**
```json
{
  "id": "uuid",
  "content": "string (1-500 chars)",
  "score": "number",
  "username": "string",
  "avatar_url": "string | null",
  "parent_reply_id": "uuid | null (for nested replies)",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp",
  "user_vote": "1 | -1 | null (if authenticated)"
}
```

**User:**
```json
{
  "id": "uuid",
  "username": "string",
  "role": "user | moderator | admin",
  "provider": "string",
  "avatar_url": "string | null",
  "created_at": "ISO timestamp"
}
```
