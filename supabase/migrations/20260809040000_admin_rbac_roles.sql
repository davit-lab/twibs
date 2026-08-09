-- ============================================================
-- ADMIN ENTERPRISE UPGRADE — STEP 1: RBAC roles
-- Run this file FIRST (before the enterprise migration) because
-- PostgreSQL forbids USING a freshly-added enum value inside the
-- same transaction that adds it.
-- ============================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support';
