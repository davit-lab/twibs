-- Marketplace is a first-class placement in the existing Twibs ads system.
-- PostgreSQL enum values must be committed before functions can use them, so
-- this intentionally lives in its own forward migration.
ALTER TYPE public.ad_placement ADD VALUE IF NOT EXISTS 'marketplace';
