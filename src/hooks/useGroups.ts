import { useMemo } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/SystemSettingsContext';
import { useToast } from '@/hooks/use-toast';

export interface Group {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  privacy: 'public' | 'private';
  creator_id: string;
  member_count: number;
  post_count: number;
  created_at: string;
  updated_at: string;
  profiles?: {
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  membership?: GroupMembership | null;
  join_request?: GroupJoinRequest | null;
}

export type GroupRole = 'owner' | 'admin' | 'moderator' | 'member';

export type GroupJoinRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

export interface GroupJoinRequest {
  id: string;
  group_id: string;
  user_id: string;
  status: GroupJoinRequestStatus;
  created_at: string;
  handled_at: string | null;
  handled_by: string | null;
}

export interface GroupJoinRequestWithProfile extends GroupJoinRequest {
  profiles?: {
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

export interface GroupMembership {
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
  profiles?: {
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

export interface GroupPost {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  media_url: string | null;
  media_type: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
  profiles?: {
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
  user_has_liked?: boolean;
}

export interface GroupPostComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  like_count: number;
  created_at: string;
  profiles?: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

const GROUP_PROFILES_JOIN = `
  user_id,
  username,
  display_name,
  avatar_url,
  is_verified
`;

export function useGroups(search?: string) {
  const { user } = useAuth();

  const groupsQuery = useQuery({
    queryKey: ['groups', search],
    queryFn: async (): Promise<Group[]> => {
      let query = (supabase as any)
        .from('groups')
        .select(`
          *,
          profiles!groups_creator_id_fkey (
            user_id,
            username,
            display_name,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false });

      if (search?.trim()) {
        query = query.ilike('name', `%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Group[];
    },
  });

  const membershipQuery = useQuery({
    queryKey: ['group-memberships', user?.id],
    queryFn: async (): Promise<Record<string, GroupMembership>> => {
      if (!user) return {};
      const { data, error } = await (supabase as any)
        .from('group_members')
        .select('group_id, user_id, role, joined_at')
        .eq('user_id', user.id);

      if (error) throw error;
      const map: Record<string, GroupMembership> = {};
      (data || []).forEach((m: GroupMembership) => { map[m.group_id] = m; });
      return map;
    },
    enabled: !!user,
  });

  const joinRequestsQuery = useQuery({
    queryKey: ['group-join-requests-mine', user?.id],
    queryFn: async (): Promise<Record<string, GroupJoinRequest>> => {
      if (!user) return {};
      const { data, error } = await (supabase as any)
        .from('group_join_requests')
        .select('id, group_id, user_id, status, created_at, handled_at, handled_by')
        .eq('user_id', user.id);

      if (error) throw error;
      const map: Record<string, GroupJoinRequest> = {};
      (data || []).forEach((r: GroupJoinRequest) => { map[r.group_id] = r; });
      return map;
    },
    enabled: !!user,
  });

  const groups = useMemo(
    () => (groupsQuery.data || []).map((g) => ({
      ...g,
      membership: membershipQuery.data?.[g.id] || null,
      join_request: joinRequestsQuery.data?.[g.id] || null,
    })),
    [groupsQuery.data, membershipQuery.data, joinRequestsQuery.data]
  );

  return {
    groups,
    memberships: membershipQuery.data || {},
    joinRequests: joinRequestsQuery.data || {},
    isLoading: groupsQuery.isLoading || (!!user && membershipQuery.isLoading),
    error: groupsQuery.error || membershipQuery.error || joinRequestsQuery.error,
    refetch: groupsQuery.refetch,
  };
}

export function useGroup(slug: string) {
  const { user } = useAuth();

  const groupQuery = useQuery({
    queryKey: ['group', slug],
    queryFn: async (): Promise<Group | null> => {
      const { data, error } = await (supabase as any)
        .from('groups')
        .select(`
          *,
          profiles!groups_creator_id_fkey (
            user_id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('slug', slug)
        .maybeSingle();

      if (error) throw error;
      return (data as Group) || null;
    },
    enabled: !!slug,
  });

  const groupId = groupQuery.data?.id;

  const membershipQuery = useQuery({
    queryKey: ['group-membership', groupId, user?.id],
    queryFn: async (): Promise<GroupMembership | null> => {
      if (!groupId || !user) return null;
      const { data, error } = await (supabase as any)
        .from('group_members')
        .select('group_id, user_id, role, joined_at')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return (data as GroupMembership) || null;
    },
    enabled: !!groupId && !!user,
  });

  const joinRequestQuery = useQuery({
    queryKey: ['group-join-request', groupId, user?.id],
    queryFn: async (): Promise<GroupJoinRequest | null> => {
      if (!groupId || !user) return null;
      const { data, error } = await (supabase as any)
        .from('group_join_requests')
        .select('id, group_id, user_id, status, created_at, handled_at, handled_by')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return (data as GroupJoinRequest) || null;
    },
    enabled: !!groupId && !!user,
  });

  return {
    group: groupQuery.data || null,
    membership: membershipQuery.data || null,
    joinRequest: joinRequestQuery.data || null,
    isLoading: groupQuery.isLoading || (!!groupId && !!user && membershipQuery.isLoading),
    error: groupQuery.error || membershipQuery.error || joinRequestQuery.error,
  };
}

export function useGroupJoinRequests(groupId: string) {
  return useQuery({
    queryKey: ['group-join-requests', groupId],
    queryFn: async (): Promise<GroupJoinRequestWithProfile[]> => {
      const { data, error } = await (supabase as any)
        .from('group_join_requests')
        .select(`
          id,
          group_id,
          user_id,
          status,
          created_at,
          handled_at,
          handled_by,
          profiles!group_join_requests_user_id_fkey (
            user_id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .eq('group_id', groupId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as GroupJoinRequestWithProfile[];
    },
    enabled: !!groupId,
  });
}

export function useGroupPosts(groupId: string, limit = 10) {
  const { user } = useAuth();

  return useInfiniteQuery({
    queryKey: ['group-posts', groupId],
    queryFn: async ({ pageParam }): Promise<{ posts: GroupPost[]; nextCursor: string | null }> => {
      let query = (supabase as any)
        .from('group_posts')
        .select(`
          *,
          profiles!group_posts_user_id_fkey (${GROUP_PROFILES_JOIN})
        `)
        .eq('group_id', groupId)
        .eq('hidden', false)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (pageParam) {
        query = query.lt('created_at', pageParam);
      }

      const { data, error } = await query;
      if (error) throw error;

      let posts = (data || []) as GroupPost[];
      if (user && posts.length > 0) {
        const postIds = posts.map((p) => p.id);
        const { data: likes } = await (supabase as any)
          .from('group_post_likes')
          .select('post_id')
          .eq('user_id', user.id)
          .in('post_id', postIds);

        const likedIds = new Set((likes || []).map((l: any) => l.post_id));
        posts = posts.map((p) => ({ ...p, user_has_liked: likedIds.has(p.id) }));
      }

      const nextCursor = posts.length === limit ? posts[posts.length - 1].created_at : null;
      return { posts, nextCursor };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!groupId,
  });
}

export function useGroupMembers(groupId: string) {
  return useQuery({
    queryKey: ['group-members', groupId],
    queryFn: async (): Promise<GroupMember[]> => {
      const { data, error } = await (supabase as any)
        .from('group_members')
        .select(`
          id,
          group_id,
          user_id,
          role,
          joined_at,
          profiles!group_members_user_id_fkey (
            user_id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .eq('group_id', groupId)
        .order('joined_at', { ascending: true });

      if (error) throw error;
      return (data || []) as GroupMember[];
    },
    enabled: !!groupId,
  });
}

export function useGroupPostComments(postId: string) {
  return useQuery({
    queryKey: ['group-post-comments', postId],
    queryFn: async (): Promise<GroupPostComment[]> => {
      const { data, error } = await (supabase as any)
        .from('group_post_comments')
        .select(`
          *,
          profiles!group_post_comments_user_id_fkey (
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('post_id', postId)
        .eq('hidden', false)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as GroupPostComment[];
    },
    enabled: !!postId,
  });
}

export function useGroupActions() {
  const { user } = useAuth();
  const { isEnabled } = useAppSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['groups'] });
    queryClient.invalidateQueries({ queryKey: ['group-memberships'] });
    queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
    queryClient.invalidateQueries({ queryKey: ['group'] });
    queryClient.invalidateQueries({ queryKey: ['group-posts'] });
  };

  const createGroup = useMutation({
    mutationFn: async ({
      name,
      description,
      avatarUrl,
      coverUrl,
      privacy,
    }: {
      name: string;
      description?: string;
      avatarUrl?: string;
      coverUrl?: string;
      privacy: 'public' | 'private';
    }): Promise<Group> => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await (supabase as any)
        .rpc('create_group', {
          group_name: name,
          group_description: description || '',
          group_avatar_url: avatarUrl || null,
          group_cover_url: coverUrl || null,
          group_privacy: privacy,
        });

      if (error) throw error;
      return data as Group;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Group created!', description: 'Your group is now live.' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create group',
        description: error.message,
      });
    },
  });

  const joinGroup = useMutation({
    mutationFn: async (groupId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any)
        .rpc('join_group', { target_group_id: groupId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Joined!', description: 'You joined the group.' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to join',
        description: error.message,
      });
    },
  });

  const requestJoinGroup = useMutation({
    mutationFn: async (groupId: string): Promise<'joined' | 'requested'> => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await (supabase as any)
        .rpc('request_to_join_group', { target_group_id: groupId });
      if (error) throw error;
      return data as 'joined' | 'requested';
    },
    onSuccess: (result) => {
      invalidateAll();
      toast(
        result === 'joined'
          ? { title: 'Joined!', description: 'You joined the group.' }
          : { title: 'Request sent', description: 'An admin or moderator will review your request.' }
      );
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Request failed',
        description: error.message,
      });
    },
  });

  const approveJoinRequest = useMutation({
    mutationFn: async (requestId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any)
        .rpc('approve_group_join_request', { request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Request approved', description: 'The member has been added to the group.' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to approve',
        description: error.message,
      });
    },
  });

  const declineJoinRequest = useMutation({
    mutationFn: async (requestId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any)
        .rpc('decline_group_join_request', { request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Request declined', description: 'The request has been declined.' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to decline',
        description: error.message,
      });
    },
  });

  const cancelJoinRequest = useMutation({
    mutationFn: async (requestId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any)
        .rpc('cancel_group_join_request', { request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Request cancelled' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to cancel request',
        description: error.message,
      });
    },
  });

  const leaveGroup = useMutation({
    mutationFn: async (groupId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any)
        .rpc('leave_group', { target_group_id: groupId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Left group', description: 'You are no longer a member.' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to leave group',
        description: error.message,
      });
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async (groupId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any)
        .from('groups')
        .delete()
        .eq('id', groupId)
        .eq('creator_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Group deleted' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to delete group',
        description: error.message,
      });
    },
  });

  const updateGroup = useMutation({
    mutationFn: async ({
      groupId,
      name,
      description,
      avatarUrl,
      coverUrl,
      privacy,
    }: {
      groupId: string;
      name: string;
      description?: string;
      avatarUrl?: string | null;
      coverUrl?: string | null;
      privacy: 'public' | 'private';
    }): Promise<Group> => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await (supabase as any).rpc('update_group', {
        target_group_id: groupId,
        group_name: name,
        group_description: description || '',
        group_avatar_url: avatarUrl ?? null,
        group_cover_url: coverUrl ?? null,
        group_privacy: privacy,
      });

      if (error) throw error;
      return data as Group;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Settings saved', description: 'The group has been updated.' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update group',
        description: error.message,
      });
    },
  });

  const setMemberRole = useMutation({
    mutationFn: async ({
      groupId,
      targetUserId,
      role,
    }: {
      groupId: string;
      targetUserId: string;
      role: GroupRole;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any).rpc('set_group_member_role', {
        target_group_id: groupId,
        target_user_id: targetUserId,
        new_role: role,
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-members', variables.groupId] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update role',
        description: error.message,
      });
    },
  });

  const removeMember = useMutation({
    mutationFn: async ({ groupId, targetUserId }: { groupId: string; targetUserId: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any).rpc('remove_group_member', {
        target_group_id: groupId,
        target_user_id: targetUserId,
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-members', variables.groupId] });
      invalidateAll();
      toast({ title: 'Member removed' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to remove member',
        description: error.message,
      });
    },
  });

  const createPost = useMutation({
    mutationFn: async ({
      groupId,
      content,
      mediaUrl,
      mediaType,
    }: {
      groupId: string;
      content: string;
      mediaUrl?: string;
      mediaType?: string;
    }): Promise<GroupPost> => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await (supabase as any)
        .from('group_posts')
        .insert({
          group_id: groupId,
          user_id: user.id,
          content,
          media_url: mediaUrl || null,
          media_type: mediaType || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as GroupPost;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-posts'] });
      queryClient.invalidateQueries({ queryKey: ['group'] });
      toast({ title: 'Posted!', description: 'Your post is now live in the group.' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to post',
        description: error.message,
      });
    },
  });

  const deletePost = useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any)
        .from('group_posts')
        .delete()
        .eq('id', postId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Deleted', description: 'Your post has been removed.' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to delete post',
        description: error.message,
      });
    },
  });

  const likePost = useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any)
        .from('group_post_likes')
        .insert({ post_id: postId, user_id: user.id });
      if (error && !error.message?.includes('duplicate')) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-posts'] }),
  });

  const unlikePost = useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any)
        .from('group_post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-posts'] }),
  });

  const addComment = useMutation({
    mutationFn: async ({
      postId,
      content,
      parentId,
    }: {
      postId: string;
      content: string;
      parentId?: string;
    }): Promise<GroupPostComment> => {
      if (!user) throw new Error('Not authenticated');
      if (!isEnabled('comments_enabled')) throw new Error('Comments are currently disabled by the admin.');

      const { data, error } = await (supabase as any)
        .from('group_post_comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content,
          parent_id: parentId || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as GroupPostComment;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-post-comments', variables.postId] });
      queryClient.invalidateQueries({ queryKey: ['group-posts'] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to comment',
        description: error.message,
      });
    },
  });

  const deleteComment = useMutation({
    mutationFn: async ({ commentId, postId }: { commentId: string; postId: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any)
        .from('group_post_comments')
        .delete()
        .eq('id', commentId);
      if (error) throw error;
      return postId;
    },
    onSuccess: (postId) => {
      queryClient.invalidateQueries({ queryKey: ['group-post-comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['group-posts'] });
    },
  });

  return {
    createGroup,
    joinGroup,
    leaveGroup,
    requestJoinGroup,
    approveJoinRequest,
    declineJoinRequest,
    cancelJoinRequest,
    deleteGroup,
    updateGroup,
    setMemberRole,
    removeMember,
    createPost,
    deletePost,
    likePost,
    unlikePost,
    addComment,
    deleteComment,
  };
}

export async function uploadGroupMedia(file: File): Promise<{ url: string; type: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Not authenticated');

  const ext = file.name.split('.').pop();
  const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

  const { error } = await supabase.storage
    .from('group-media')
    .upload(fileName, file);

  if (error) {
    throw new Error(error.message);
  }

  const { data: { publicUrl } } = supabase.storage
    .from('group-media')
    .getPublicUrl(fileName);

  return { url: publicUrl, type: file.type };
}
