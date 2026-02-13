# API Usage Examples

## Auth

<details>
<summary><strong>Login</strong></summary>

**POST** `/auth`

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

<details>
<summary><strong>Get Profile</strong></summary>

**GET** `/me`

Auth: Required

Response:
```json
{
  "user": {
    "id": "abc-123",
    "username": "john_doe",
    "role": "user",
    "provider": "anilist",
    "avatar_url": "https://..."
  }
}
```
</details>

<details>
<summary><strong>Logout</strong></summary>

**DELETE** `/auth`

Auth: Required

Response:
```json
{ "message": "Logged out successfully" }
```
</details>

---

## Posts (Comments & Replies)

<details>
<summary><strong>Get Comments for Media</strong></summary>

**GET** `/posts?media_id=anime-1&limit=10`

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
      "replies": [
        {
          "id": "r-1",
          "content": "I agree completely!",
          "score": 3,
          "username": "jane_doe",
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
<summary><strong>Get Replies (Thread)</strong></summary>

**GET** `/posts?root_id=c-1&limit=20`

Auth: Optional

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
    }
  ],
  "next_cursor": "2026-02-12T10:35:00Z"
}
```

</details>

<details>
<summary><strong>Create Comment</strong></summary>

**POST** `/posts`

Auth: Required

Request:
```json
{
  "media_id": "anime-1",
  "content": "Best anime ever!"
}
```

Response:
```json
{
  "post": {
    "id": "c-2",
    "content": "Best anime ever!",
    "status": "active",
    "created_at": "2026-02-12T10:30:00Z",
    "media_id": "anime-1",
    "root_id": "c-2"
  }
}
```
</details>

<details>
<summary><strong>Create Reply</strong></summary>

**POST** `/posts`

Auth: Required

Request:
```json
{
  "parent_id": "c-1", // or reply id
  "content": "I totally agree!"
}
```

Response:
```json
{
  "post": {
    "id": "r-3",
    "content": "I totally agree!",
    "parent_id": "c-1",
    "root_id": "c-1"
  }
}
```
</details>

<details>
<summary><strong>Update Post</strong></summary>

**PATCH** `/posts`

Auth: Required

Request:
```json
{
  "id": "c-1",
  "content": "Updated text"
}
```

Response:
```json
{
  "post": {
    "id": "c-1",
    "content": "Updated text",
    "updated_at": "2026-02-12T11:30:00Z"
  }
}
```
</details>

<details>
<summary><strong>Delete Post</strong></summary>

**DELETE** `/posts`

Auth: Required

Request (Body or Query Param):
`DELETE /posts?id=c-1`

Response:
```json
{
  "post": {
    "id": "c-1",
    "status": "deleted"
  }
}
```
</details>

---

## Votes

<details>
<summary><strong>Vote on Post</strong></summary>

**POST** `/votes`

Auth: Required

Request:
```json
{
  "post_id": "c-1",
  "vote_type": 1
}
```
`vote_type`: `1` (upvote) or `-1` (downvote). Send same vote to toggle off (remove).

Response:
```json
{
  "post_id": "c-1",
  "score": 16
}
```
</details>

---

## Reports

<details>
<summary><strong>Report Post</strong></summary>

**POST** `/reports`

Auth: Required

Request:
```json
{
  "post_id": "c-1",
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

---
