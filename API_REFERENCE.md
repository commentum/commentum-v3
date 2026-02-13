# API Reference

**Base URL:** `https://<PROJECT_REF>.supabase.co/functions/v1`

**Authentication:** Protected endpoints require `Authorization: Bearer <JWT_TOKEN>`

Dear noobs, If you are wondering where would you get this fucking `JWT_TOKEN`, you will get this as `token` after you make a request to `/auth-login`.

#### ⚠️ DO NOT USE anilist, mal or simkl `access_token` for protected routes 

**Errors:** All endpoints return `{ "error": "Error message" }`

---

## Authentication

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

---

## Replies

<details>
<summary><strong>POST /replies-create</strong> (Protected)</summary>

Create a reply to a comment.

**Limits:** 500 chars | 10 req/min per user

Request:
```json
{
  "comment_id": "uuid",
  "content": "I agree!"
}
```

Response (201):
```json
{
  "reply": {
    "id": "uuid",
    "content": "I agree!",
    "score": 0,
    "created_at": "2026-02-12T...",
    "updated_at": "2026-02-12T..."
  }
}
```

</details>

<details>
<summary><strong>GET /replies-list</strong></summary>

Get paginated replies for a comment.

**Query Params:**
- `comment_id` (required)
- `limit` (optional, default 20, max 100)
- `cursor` (optional) - ISO timestamp for pagination

If authenticated, includes `user_vote` field for each reply.

Response (200):
```json
{
  "replies": [
    {
      "id": "uuid",
      "content": "I agree!",
      "score": 2,
      "username": "jane_doe",
      "created_at": "2026-02-12T...",
      "user_vote": -1
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
  "status": "active | hidden | removed",
  "username": "string",
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
  "created_at": "ISO timestamp"
}
```
