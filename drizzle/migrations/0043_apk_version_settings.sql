ALTER TABLE public.maintenance_settings 
ADD COLUMN min_apk_version INTEGER DEFAULT 0,
ADD COLUMN latest_apk_version INTEGER DEFAULT 0,
ADD COLUMN apk_download_url TEXT;
