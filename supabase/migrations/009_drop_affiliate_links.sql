-- 009: Remove affiliate links entirely (product decision: no affiliate program).
-- The affiliate_links table is not used by any remaining code path.

DROP TABLE IF EXISTS public.affiliate_links;
