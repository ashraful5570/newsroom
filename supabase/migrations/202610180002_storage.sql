-- Supabase Storage is optional in vanilla PostgreSQL integration tests.
-- Application media is served through authenticated API routes; no public bucket access.
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('newsroom-media','newsroom-media',false,8388608,ARRAY['image/png'])
  ON CONFLICT(id) DO NOTHING;
 END IF;
END $$;
