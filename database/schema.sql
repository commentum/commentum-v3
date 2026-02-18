BEGIN;
DROP VIEW IF EXISTS public.users_public CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.reports CASCADE;
DROP TABLE IF EXISTS public.votes CASCADE;
DROP TABLE IF EXISTS public.posts CASCADE;

COMMIT;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  is_banned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  root_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  media_id TEXT,
  media_provider TEXT,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  score INTEGER NOT NULL DEFAULT 0,
  client TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'removed', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT root_must_have_media CHECK (
    (parent_id IS NULL AND media_id IS NOT NULL) OR (parent_id IS NOT NULL)
  )
);

CREATE TABLE public.votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vote_type INTEGER NOT NULL CHECK (vote_type IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_posts_media_id ON public.posts(media_id) WHERE parent_id IS NULL;
CREATE INDEX idx_posts_root_id ON public.posts(root_id);
CREATE INDEX idx_posts_created_at ON public.posts(created_at);
CREATE INDEX idx_votes_post_id ON public.votes(post_id);
CREATE INDEX idx_reports_post_id ON public.reports(post_id);

CREATE OR REPLACE VIEW public.users_public AS
SELECT id, username, role, created_at FROM public.users;

-- TRIGGERS FOR SCORE SYNC

DROP TRIGGER IF EXISTS trg_sync_post_score ON public.votes;
CREATE OR REPLACE FUNCTION public.handle_post_score()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.posts SET score = score + NEW.vote_type WHERE id = NEW.post_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.posts SET score = score - OLD.vote_type WHERE id = OLD.post_id;
  ELSIF (TG_OP = 'UPDATE') THEN
    UPDATE public.posts SET score = score - OLD.vote_type + NEW.vote_type WHERE id = NEW.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_post_score
AFTER INSERT OR UPDATE OR DELETE ON public.votes
FOR EACH ROW EXECUTE FUNCTION public.handle_post_score();

-- TRIGGER FOR AUTO ROOT_ID and MEDIA_PROVIDER ASSIGNMENT

DROP TRIGGER IF EXISTS trg_assign_post_metadata ON public.posts;

CREATE OR REPLACE FUNCTION public.handle_post_metadata()
RETURNS TRIGGER AS $$
DECLARE
  parent_root_id UUID;
  parent_media_provider TEXT;
BEGIN
  -- Case 1: Root post
  IF NEW.parent_id IS NULL THEN
    NEW.root_id := NEW.id;

  -- Case 2: Reply post
  ELSE
    SELECT COALESCE(root_id, id), media_provider
    INTO parent_root_id, parent_media_provider
    FROM public.posts
    WHERE id = NEW.parent_id;

    NEW.root_id := parent_root_id;
    NEW.media_provider := parent_media_provider;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_post_metadata
BEFORE INSERT ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.handle_post_metadata();