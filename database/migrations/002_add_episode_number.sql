-- Add episode_number column to posts table if it doesn't exist
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS episode_number INTEGER;

-- Create index for episode filtering on root posts
CREATE INDEX IF NOT EXISTS idx_posts_media_episode ON public.posts(media_id, episode_number) WHERE parent_id IS NULL;

-- Update trigger function to inherit media_id, media_provider, and episode_number on replies
CREATE OR REPLACE FUNCTION public.handle_post_metadata()
RETURNS TRIGGER AS $$
DECLARE
  parent_root_id UUID;
  parent_media_id TEXT;
  parent_media_provider TEXT;
  parent_episode_number INTEGER;
BEGIN
  -- Case 1: Root post
  IF NEW.parent_id IS NULL THEN
    NEW.root_id := NEW.id;

  -- Case 2: Reply post
  ELSE
    SELECT COALESCE(root_id, id), media_id, media_provider, episode_number
    INTO parent_root_id, parent_media_id, parent_media_provider, parent_episode_number
    FROM public.posts
    WHERE id = NEW.parent_id;

    NEW.root_id := parent_root_id;
    NEW.media_id := COALESCE(NEW.media_id, parent_media_id);
    NEW.media_provider := COALESCE(NEW.media_provider, parent_media_provider);
    NEW.episode_number := COALESCE(NEW.episode_number, parent_episode_number);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
