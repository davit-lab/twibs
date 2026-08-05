-- Backfill sample locations for existing dev profiles so Explore
-- can show distance pills. Update-by-username; safe to run repeatedly.
-- Viewers without their own location will use these as fallback.
UPDATE profiles SET location = 'Tbilisi, Georgia'      WHERE username = 'admin' AND (location IS NULL OR location = '');
UPDATE profiles SET location = 'Tbilisi, Georgia'      WHERE username = 'datosandro_8a7e84ac' AND (location IS NULL OR location = '');
UPDATE profiles SET location = 'Batumi, Georgia'       WHERE username = 'egobox' AND (location IS NULL OR location = '');
UPDATE profiles SET location = 'Kutaisi, Georgia'      WHERE username = 'errorid' AND (location IS NULL OR location = '');
UPDATE profiles SET location = 'Tbilisi, Georgia'      WHERE username = 'sabuka17' AND (location IS NULL OR location = '');
