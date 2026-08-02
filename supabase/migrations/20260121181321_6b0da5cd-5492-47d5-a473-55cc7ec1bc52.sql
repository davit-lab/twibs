-- Add missed_call to notification_type enum
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'missed_call';