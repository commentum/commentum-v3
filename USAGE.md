# API Usage Examples

<details>
<summary><strong>Setup: Get JWT Token</strong></summary>

**POST** `/auth-login`

Request:
```json
{
  "provider": "anilist",
  "access_token": "your_anilist_access_token"
}
```

Response:
```json
{
  "token": "eyJhbGci...",
  "user": {
    "id": "abc-123",
    "username": "john_doe",
    "role": "user",
    "provider": "anilist"
  }
}
```

Use in all protected endpoints:
```
Authorization: Bearer eyJhbGci...
```

</details>

---

## Comments

<details>
<summary><strong>Get Comments for Media</strong></summary>

**GET** `/comments-list?mediaId=anime-1&limit=10`

Auth: Optional (includes `user_vote` if authenticated)

Response (includes up to 5 replies per comment):
```json
{
  "comments": [
    {
      "id": "c-1",
      "content": "This anime is amazing!",
      "score": 15,
      "username": "john_doe",
      "status": "active",
      "created_at": "2026-02-12T10:00:00Z",
      "replies": [
        {
          "id": "r-1",
          "content": "I agree completely!",
          "score": 3,
          "username": "jane_doe",
          "created_at": "2026-02-12T10:05:00Z",
          "user_vote": 1
        }
      ],
      "has_more_replies": true,
      "replies_count": 8,
      "user_vote": null
    }
  ],
  "next_cursor": "2026-02-12T10:00:00Z"
}
```

</details>

<details>
<summary><strong>Create Comment</strong></summary>

**POST** `/comments-create`

Auth: Required

Request:
```json
{
  "mediaId": "anime-1",
  "content": "Best anime ever!"
}
```

Response:
```json
{
  "comment": {
    "id": "c-2",
    "content": "Best anime ever!",
    "score": 0,
    "status": "active",
    "created_at": "2026-02-12T10:30:00Z"
  }
}
```

</details>

<details>
<summary><strong>Vote on Comment</strong></summary>

**POST** `/comments-vote`

Auth: Required

Request:
```json
{
  "comment_id": "c-1",
  "vote_type": 1
}
```

Response:
```json
{
  "comment_id": "c-1",
  "score": 16
}
```

</details>

<details>
<summary><strong>Report Comment</strong></summary>

**POST** `/comments-report`

Auth: Required

Request:
```json
{
  "comment_id": "c-1",
  "reason": "Spam content"
}
```

Response:
```json
{
  "message": "Report submitted"
}
```

</details>

<details>
<summary><strong>Update Your Comment</strong></summary>

**POST** `/comments-update`

Auth: Required

Request:
```json
{
  "comment_id": "c-1",
  "content": "Updated comment text"
}
```

Response:
```json
{
  "comment": {
    "id": "c-1",
    "content": "Updated comment text",
    "score": 5,
    "status": "active",
    "created_at": "2026-02-12T10:00:00Z",
    "updated_at": "2026-02-12T11:30:00Z"
  }
}
```

</details>

<details>
<summary><strong>Delete Your Comment</strong></summary>

**POST** `/comments-delete`

Auth: Required

Request:
```json
{
  "comment_id": "c-1"
}
```

Response:
```json
{
  "comment": {
    "id": "c-1",
    "status": "deleted",
    "updated_at": "2026-02-12T11:35:00Z"
  }
}
```

</details>

---

## Replies

<details>
<summary><strong>Get All Replies for Comment</strong></summary>

**GET** `/replies-list?comment_id=c-1&limit=20`

Auth: Optional (includes `user_vote` if authenticated)

Response:
```json
{
  "replies": [
    {
      "id": "r-1",
      "content": "I agree completely!",
      "score": 3,
      "username": "jane_doe",
      "created_at": "2026-02-12T10:35:00Z",
      "user_vote": -1
    },
    {
      "id": "r-2",
      "content": "Great point!",
      "score": 1,
      "username": "bob_smith",
      "created_at": "2026-02-12T10:40:00Z",
      "user_vote": null
    }
  ],
  "next_cursor": "2026-02-12T10:40:00Z"
}
```

</details>

<details>
<summary><strong>Create Reply</strong></summary>

**POST** `/replies-create`

Auth: Required

Request:
```json
{
  "comment_id": "c-1",
  "content": "I totally agree!"
}
```

Response:
```json
{
  "reply": {
    "id": "r-3",
    "content": "I totally agree!",
    "score": 0,
    "created_at": "2026-02-12T10:45:00Z"
  }
}
```

</details>

<details>
<summary><strong>Vote on Reply</strong></summary>

**POST** `/replies-vote`

Auth: Required

Request:
```json
{
  "reply_id": "r-1",
  "vote_type": 1
}
```

Response:
```json
{
  "reply_id": "r-1",
  "score": 4
}
```

</details>

<details>
<summary><strong>Update Your Reply</strong></summary>

**POST** `/replies-update`

Auth: Required

Request:
```json
{
  "reply_id": "r-1",
  "content": "Updated reply text"
}
```

Response:
```json
{
  "reply": {
    "id": "r-1",
    "content": "Updated reply text",
    "score": 3,
    "created_at": "2026-02-12T10:35:00Z",
    "updated_at": "2026-02-12T11:40:00Z"
  }
}
```

</details>

<details>
<summary><strong>Delete Your Reply</strong></summary>

**POST** `/replies-delete`

Auth: Required

Request:
```json
{
  "reply_id": "r-1"
}
```

Response:
```json
{
  "message": "Reply deleted successfully"
}
```

</details>

---

## Moderation (Moderator+ only)

<details>
<summary><strong>Get Reported Comments</strong></summary>

**GET** `/moderation-reports?limit=10`

Auth: Moderator+

Response:
```json
{
  "reports": [
    {
      "id": "rep-1",
      "reason": "Spam",
      "comment_id": "c-5",
      "comment_content": "Buy cheap products...",
      "comment_author": "spammer_user",
      "reporter": "john_doe",
      "created_at": "2026-02-12T09:00:00Z"
    }
  ]
}
```

</details>

<details>
<summary><strong>Change Comment Status</strong></summary>

**POST** `/moderation-comment-status`

Auth: Moderator+

Request:
```json
{
  "comment_id": "c-5",
  "status": "hidden"
}
```

Response:
```json
{
  "comment": {
    "id": "c-5",
    "status": "hidden",
    "updated_at": "2026-02-12T10:50:00Z"
  }
}
```

Allowed statuses: `active`, `hidden`, `removed`

</details>

<details>
<summary><strong>Ban User</strong></summary>

**POST** `/moderation-ban-user`

Auth: Admin only

Request:
```json
{
  "user_id": "user-spam-123"
}
```

Response:
```json
{
  "message": "User spammer_user has been banned",
  "user": {
    "id": "user-spam-123",
    "username": "spammer_user",
    "is_banned": true
  }
}
```

</details>

---

## Error Examples

<details>
<summary><strong>Missing Required Field</strong></summary>

Request: Missing `mediaId` in comment creation

Response (400):
```json
{
  "error": "mediaId is required and must be a string"
}
```

</details>

<details>
<summary><strong>Unauthorized</strong></summary>

Request: Missing auth token on protected endpoint

Response (401):
```json
{
  "error": "Unauthorized"
}
```

</details>

<details>
<summary><strong>Rate Limited</strong></summary>

Request: Exceeded rate limit (5 comments in 60 seconds)

Response (429):
```json
{
  "error": "Too many comments. Try again later."
}
```

</details>

<details>
<summary><strong>Insufficient Permissions</strong></summary>

Request: Regular user attempting to ban another user

Response (403):
```json
{
  "error": "Forbidden"
}
```

</details>

---

## Pagination

Use `next_cursor` to fetch next page:

**First request:**
```
GET /comments-list?mediaId=anime-1&limit=5
```

Returns: `{ "comments": [...], "next_cursor": "2026-02-12T10:00:00Z" }`

**Next page:**
```
GET /comments-list?mediaId=anime-1&limit=5&cursor=2026-02-12T10:00:00Z
```

---

## Quick Reference

| Task | Endpoint | Auth |
|------|----------|------|
| Get comments | GET `/comments-list` | Optional |
| Create comment | POST `/comments-create` | Yes |
| Update comment | POST `/comments-update` | Yes |
| Delete comment | POST `/comments-delete` | Yes |
| Vote comment | POST `/comments-vote` | Yes |
| Report comment | POST `/comments-report` | Yes |
| Get replies | GET `/replies-list` | Optional |
| Create reply | POST `/replies-create` | Yes |
| Update reply | POST `/replies-update` | Yes |
| Delete reply | POST `/replies-delete` | Yes |
| Vote reply | POST `/replies-vote` | Yes |
| Get reports | GET `/moderation-reports` | Mod+ |
| Change status | POST `/moderation-comment-status` | Mod+ |
| Ban user | POST `/moderation-ban-user` | Admin |
