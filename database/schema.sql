CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users table
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  is_banned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);

-- Sessions table
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);

-- Comments table
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_media_id ON public.comments(media_id);
CREATE INDEX idx_comments_created_at ON public.comments(created_at);
CREATE INDEX idx_comments_score ON public.comments(score);

-- Comment votes table
CREATE TABLE public.comment_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vote_type INTEGER NOT NULL CHECK (vote_type IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

-- Comment replies table
CREATE TABLE public.comment_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comment_replies_comment_id ON public.comment_replies(comment_id);
CREATE INDEX idx_comment_replies_created_at ON public.comment_replies(created_at);
CREATE INDEX idx_comment_replies_score ON public.comment_replies(score);

-- Reply votes table
CREATE TABLE public.reply_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id UUID NOT NULL REFERENCES public.comment_replies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vote_type INTEGER NOT NULL CHECK (vote_type IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reply_id, user_id)
);
CREATE INDEX idx_reply_votes_reply_id ON public.reply_votes(reply_id);

-- Comment reports table
CREATE TABLE public.comment_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id),
  reason TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comment_reports_comment_id ON public.comment_reports(comment_id);

-- Public view for users (hides sensitive fields)
CREATE VIEW public.users_public AS
SELECT id, username, role, created_at
FROM public.users;

-- Function to atomically recalculate comment score
CREATE OR REPLACE FUNCTION public.recalculate_comment_score(p_comment_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_score INTEGER;
BEGIN
  SELECT COALESCE(SUM(vote_type), 0) INTO new_score
  FROM public.comment_votes
  WHERE comment_id = p_comment_id;

  UPDATE public.comments
  SET score = new_score, updated_at = now()
  WHERE id = p_comment_id;

  RETURN new_score;
END;
$$;

-- Function to atomically recalculate reply score
CREATE OR REPLACE FUNCTION public.recalculate_reply_score(p_reply_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_score INTEGER;
BEGIN
  SELECT COALESCE(SUM(vote_type), 0) INTO new_score
  FROM public.reply_votes
  WHERE reply_id = p_reply_id;

  UPDATE public.comment_replies
  SET score = new_score, updated_at = now()
  WHERE id = p_reply_id;

  RETURN new_score;
END;
$$;

-- Function to count unresolved reports for a comment
CREATE OR REPLACE FUNCTION public.count_unresolved_reports(p_comment_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  report_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO report_count
  FROM public.comment_reports
  WHERE comment_id = p_comment_id AND resolved = false;

  RETURN report_count;
END;
$$;
