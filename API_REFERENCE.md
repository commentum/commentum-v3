# Commentum API Reference

## Overview

**Base URL:** `https://<PROJECT_REF>.supabase.co/functions/v1`

**Authentication:** Protected endpoints require `Authorization: Bearer <JWT_TOKEN>`

Get your JWT token from the `/auth-login` endpoint.

**All responses** use the format: `{ "data": ... }` on success or `{ "error": "..." }` on failure.

---

## Database Architecture

The API uses a **unified posts model**:
- All comments and replies are stored in a single `posts` table
- Root posts have `parent_id = NULL` and `media_id = SET`
- Replies have `parent_id = UUID` and `media_id = NULL`
- `root_id` automatically points to the top-level post for easy hierarchical queries
- All voting uses a unified `votes` table (previously separate comment_votes/reply_votes)

---

## Posts & Replies

<details>
<summary><strong>POST /auth-login</strong></summary>

Login with OAuth provider.

Request:
```json
{
  "provider": "anilist",
  "access_token": "anilist_access_token"
}
```

Response (200):
```json
{
  "token": "eyJhbGci...",
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

<details>
<summary><strong>POST /auth-logout</strong> (Protected)</summary>

Revoke current session.

Response (200):
```json
{
  "message": "Logged out successfully"
}
```

</details>

<details>
<summary><strong>GET /auth-me</strong> (Protected)</summary>

Get current user profile.

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

## Comments

<details>
<summary><strong>POST /comments-create</strong> (Protected)</summary>

Create a comment.

**Limits:** 500 chars | 5 req/min per user

Request:
```json
{
  "mediaId": "anime-123",
  "content": "Great anime!"
}
```

Response (201):
```json
{
  "comment": {
    "id": "uuid",
    "content": "Great anime!",
    "score": 0,
    "status": "active",
    "created_at": "2026-02-12T...",
    "updated_at": "2026-02-12T..."
  }
}
```

</details>

<details>
<summary><strong>GET /comments-list</strong></summary>

Get comments with up to 5 replies each.

**Query Params:**
- `mediaId` (required)
- `limit` (optional, default 20, max 100)
- `cursor` (optional) - ISO timestamp for pagination

If authenticated, includes `user_vote` field for each comment and reply.

Response (200):
```json
{
  "comments": [
    {
      "id": "uuid",
      "content": "Great anime!",
      "score": 5,
      "status": "active",
      "username": "john_doe",
      "created_at": "2026-02-12T...",
      "replies": [
        {
          "id": "uuid",
          "content": "I agree!",
          "score": 2,
          "username": "jane_doe",
          "created_at": "2026-02-12T..."
        }
      ],
      "has_more_replies": false,
      "replies_count": 1,
      "user_vote": 1
    }
  ],
  "next_cursor": "2026-02-12T..." | null
}
```

</details>

<details>
<summary><strong>POST /comments-vote</strong> (Protected)</summary>

Vote on a comment.

**Limits:** 10 req/min per user

Request:
```json
{
  "comment_id": "uuid",
  "vote_type": 1
}
```

`vote_type`: `1` (upvote) or `-1` (downvote)

Response (200):
```json
{
  "comment_id": "uuid",
  "score": 6
}
```

</details>

<details>
<summary><strong>POST /comments-report</strong> (Protected)</summary>

Report a comment. Auto-hides at 5+ unresolved reports.

**Limits:** 5 req/min per user

Request:
```json
{
  "comment_id": "uuid",
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

<details>
<summary><strong>POST /comments-update</strong> (Protected)</summary>

Update your own comment.

**Limits:** 10 req/min per user

Request:
```json
{
  "comment_id": "uuid",
  "content": "Updated comment text"
}
```

Response (200):
```json
{
  "comment": {
    "id": "uuid",
    "content": "Updated comment text",
    "score": 5,
    "status": "active",
    "created_at": "2026-02-12T...",
    "updated_at": "2026-02-12T..."
  }
}
```

</details>

<details>
<summary><strong>POST /comments-delete</strong> (Protected)</summary>

Delete your own comment (marks as deleted).

**Limits:** 10 req/min per user

Request:
```json
{
  "comment_id": "uuid"
}
```

Response (200):
```json
{
  "comment": {
    "id": "uuid",
    "status": "deleted",
    "updated_at": "2026-02-12T..."
  }
}
```

</details>

---

## Replies

<details>
<summary><strong>POST /replies-create</strong> (Protected)</summary>

Create a reply to a comment or a nested reply to another reply.

**Limits:** 500 chars | 10 req/min per user

Request:
```json
{
  "comment_id": "uuid",
  "content": "I agree!",
  "parent_reply_id": "uuid (optional - for nested replies)"
}
```

Response (201):
```json
{
  "reply": {
    "id": "uuid",
    "content": "I agree!",
    "score": 0,
    "parent_reply_id": null,
    "created_at": "2026-02-12T...",
    "updated_at": "2026-02-12T..."
  }
}
```

</details>

<details>
<summary><strong>GET /replies-list</strong></summary>

Get paginated replies for a comment or nested replies for a reply.

**Query Params:**
- `comment_id` (required)
- `parent_reply_id` (optional) - fetch replies to a specific reply (nested replies)
- `limit` (optional, default 20, max 100)
- `cursor` (optional) - ISO timestamp for pagination

Response (200):
```json
{
  "replies": [
    {
      "id": "uuid",
      "content": "I agree!",
      "score": 2,
      "username": "jane_doe",
      "avatar_url": "https://...",
      "created_at": "2026-02-12T...",
      "parent_reply_id": null,
      "user_vote": 1
    }
  ],
  "next_cursor": "2026-02-12T..." | null
}
```

</details>

<details>
<summary><strong>POST /replies-vote</strong> (Protected)</summary>

Vote on a reply.

**Limits:** 10 req/min per user

Request:
```json
{
  "reply_id": "uuid",
  "vote_type": 1
}
```

`vote_type`: `1` (upvote) or `-1` (downvote)

Response (200):
```json
{
  "reply_id": "uuid",
  "score": 3
}
```

</details>

<details>
<summary><strong>POST /replies-update</strong> (Protected)</summary>

Update your own reply.

**Limits:** 10 req/min per user

Request:
```json
{
  "reply_id": "uuid",
  "content": "Updated reply text"
}
```

Response (200):
```json
{
  "reply": {
    "id": "uuid",
    "content": "Updated reply text",
    "score": 2,
    "created_at": "2026-02-12T...",
    "updated_at": "2026-02-12T..."
  }
}
```

</details>

<details>
<summary><strong>POST /replies-delete</strong> (Protected)</summary>

Delete your own reply.

**Limits:** 10 req/min per user

Request:
```json
{
  "reply_id": "uuid"
}
```

Response (200):
```json
{
  "message": "Reply deleted successfully"
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
| `/auth-login` | 10/min per IP |
| `/comments-create` | 5/min per user |
| `/comments-vote` | 10/min per user |
| `/comments-report` | 5/min per user |
| `/replies-create` | 10/min per user |
| `/replies-vote` | 10/min per user |

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
