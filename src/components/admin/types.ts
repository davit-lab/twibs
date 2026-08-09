export interface AdminUser {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  email?: string;
  bio?: string | null;
  avatar_url?: string | null;
  is_verified: boolean;
  privacy: string;
  created_at: string;
  role: string;
  role_hierarchy: number;
}

export interface UserBan {
  id: string;
  user_id: string;
  banned_by: string;
  reason: string;
  banned_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export interface AdminPost {
  id: string;
  content: string;
  visibility: string;
  star_count: number;
  comment_count: number;
  hidden: boolean;
  created_at: string;
  user_id: string;
  user: { display_name: string; username: string };
}

export interface AdminReel {
  id: string;
  caption: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  hidden: boolean;
  created_at: string;
  user_id: string;
  user: { display_name: string; username: string };
}

export interface AdminBook {
  id: string;
  title: string;
  status: string;
  hidden: boolean;
  created_at: string;
  author_id: string;
  author: { display_name: string; username: string };
}

export interface AdminReport {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  handled_by: string | null;
  reporter?: {
    display_name: string;
    username: string;
    avatar_url: string | null;
  } | null;
  target?: {
    type: string;
    preview?: string;
    userId?: string;
    userName?: string;
    hidden?: boolean;
  } | null;
}

export interface VerificationRequestData {
  id: string;
  user_id: string;
  message: string | null;
  status: string;
  created_at: string;
  handled_at: string | null;
  profile?: {
    display_name: string;
    username: string;
    avatar_url: string | null;
    is_verified?: boolean;
  } | null;
}

export const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'support', label: 'Support' },
  { value: 'user', label: 'User' },
] as const;

export const ROLE_HIERARCHY: Record<string, number> = {
  super_admin: 5,
  admin: 4,
  moderator: 3,
  support: 2,
  user: 1,
};

export function getRoleLabel(role: string) {
  return ROLE_OPTIONS.find(o => o.value === role)?.label ?? role;
}
