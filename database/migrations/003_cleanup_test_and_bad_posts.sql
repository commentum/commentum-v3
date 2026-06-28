-- ============================================================================
-- CLEANUP SCRIPT: Remove wrongly mapped, incomplete, and test posts
-- ============================================================================

BEGIN;

-- 1. Delete posts where parent_id references itself (invalid circular mapping)
DELETE FROM public.posts 
WHERE parent_id = id;

-- 2. Delete reply posts where parent post does not exist (orphaned replies)
DELETE FROM public.posts p1
WHERE parent_id IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM public.posts p2 WHERE p2.id = p1.parent_id
  );

-- 3. Delete root posts missing essential media identification
DELETE FROM public.posts 
WHERE parent_id IS NULL 
  AND (media_id IS NULL OR TRIM(media_id) = '');

-- 4. Delete incomplete or empty posts
DELETE FROM public.posts 
WHERE content IS NULL 
   OR TRIM(content) = ''
   OR user_id IS NULL;

-- 5. Delete test comments or placeholder strings (case-insensitive)
DELETE FROM public.posts 
WHERE content ILIKE '%test%'
   OR content ILIKE '%asdf%'
   OR content ILIKE '%qwerty%';

-- 6. Fix existing reply metadata where root_id equals id instead of parent's root_id
UPDATE public.posts p
SET root_id = parent.root_id,
    media_id = COALESCE(p.media_id, parent.media_id),
    media_provider = COALESCE(p.media_provider, parent.media_provider),
    episode_number = COALESCE(p.episode_number, parent.episode_number)
FROM public.posts parent
WHERE p.parent_id = parent.id
  AND p.root_id = p.id;

COMMIT;
