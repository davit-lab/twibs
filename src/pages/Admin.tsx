import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { 
  Shield, 
  Users, 
  BookOpen, 
  FileText, 
  Settings, 
  Loader2,
  BadgeCheck,
  UserX,
  UserCheck,
  Trash2,
  Search,
  BarChart3,
  AlertTriangle,
  Gift,
  Hammer,
  Crown,
  Ban,
  Clock,
  ShieldOff,
  Trash,
  Clapperboard,
  Play,
  Eye,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface UserWithRole {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  email?: string;
  is_verified: boolean;
  privacy: string;
  created_at: string;
  role?: string;
}

interface BookData {
  id: string;
  title: string;
  status: string;
  created_at: string;
  author: {
    display_name: string;
    username: string;
  };
}

interface PostData {
  id: string;
  content: string;
  visibility: string;
  star_count: number;
  comment_count: number;
  created_at: string;
  user: {
    display_name: string;
    username: string;
  };
}

interface SubscriptionPlan {
  id: string;
  name: string;
  tier: string;
}

interface UserBan {
  id: string;
  user_id: string;
  banned_by: string;
  reason: string;
  banned_at: string;
  expires_at: string | null;
  is_active: boolean;
}

interface ReelData {
  id: string;
  video_url: string;
  caption: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  created_at: string;
  user: {
    display_name: string;
    username: string;
  };
}

export default function Admin() {
  const { user: currentUser, isAdmin, isModerator, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [books, setBooks] = useState<BookData[]>([]);
  const [posts, setPosts] = useState<PostData[]>([]);
  const [reels, setReels] = useState<ReelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [bans, setBans] = useState<UserBan[]>([]);
  const [giftingUserId, setGiftingUserId] = useState<string | null>(null);
  const [giftingLoading, setGiftingLoading] = useState(false);
  const [banDialogUserId, setBanDialogUserId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState<string>('7d');
  const [banLoading, setBanLoading] = useState(false);
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPosts: 0,
    totalBooks: 0,
    totalReels: 0,
    verifiedUsers: 0,
    bannedUsers: 0,
  });

  useEffect(() => {
    if (!authLoading && (!currentUser || (!isAdmin && !isModerator))) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to access the admin panel.',
        variant: 'destructive',
      });
      navigate('/');
    }
  }, [currentUser, isAdmin, isModerator, authLoading, navigate]);

  useEffect(() => {
    if (currentUser && (isAdmin || isModerator)) {
      fetchData();
    }
  }, [currentUser, isAdmin, isModerator]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch users with their roles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (profilesError) throw profilesError;

      // Fetch roles for all users
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('*');

      const usersWithRoles = (profilesData || []).map(profile => ({
        ...profile,
        role: rolesData?.find(r => r.user_id === profile.user_id)?.role || 'user',
      }));

      setUsers(usersWithRoles);

      // Fetch subscription plans
      const { data: plansData } = await supabase
        .from('subscription_plans')
        .select('id, name, tier')
        .eq('is_active', true);
      
      setPlans(plansData || []);

      // Fetch active bans
      const { data: bansData } = await supabase
        .from('user_bans')
        .select('*')
        .eq('is_active', true);
      
      setBans((bansData || []) as UserBan[]);

      // Fetch books
      const { data: booksData } = await supabase
        .from('books')
        .select(`
          id,
          title,
          status,
          created_at,
          author_id
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      // Get author profiles for books
      if (booksData && booksData.length > 0) {
        const authorIds = [...new Set(booksData.map(b => b.author_id))];
        const { data: authorProfiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, username')
          .in('user_id', authorIds);

        const booksWithAuthors = booksData.map(book => ({
          ...book,
          author: authorProfiles?.find(p => p.user_id === book.author_id) || { display_name: 'Unknown', username: 'unknown' },
        }));

        setBooks(booksWithAuthors);
      }

      // Fetch posts
      const { data: postsData } = await supabase
        .from('posts')
        .select(`
          id,
          content,
          visibility,
          star_count,
          comment_count,
          created_at,
          user_id
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      // Get user profiles for posts
      if (postsData && postsData.length > 0) {
        const userIds = [...new Set(postsData.map(p => p.user_id))];
        const { data: userProfiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, username')
          .in('user_id', userIds);

        const postsWithUsers = postsData.map(post => ({
          ...post,
          user: userProfiles?.find(p => p.user_id === post.user_id) || { display_name: 'Unknown', username: 'unknown' },
        }));

        setPosts(postsWithUsers);
      }

      // Fetch reels
      const { data: reelsData } = await supabase
        .from('reels')
        .select('id, video_url, caption, view_count, like_count, comment_count, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(50);

      // Get user profiles for reels
      if (reelsData && reelsData.length > 0) {
        const reelUserIds = [...new Set(reelsData.map(r => r.user_id))];
        const { data: reelUserProfiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, username')
          .in('user_id', reelUserIds);

        const reelsWithUsers = reelsData.map(reel => ({
          ...reel,
          user: reelUserProfiles?.find(p => p.user_id === reel.user_id) || { display_name: 'Unknown', username: 'unknown' },
        }));

        setReels(reelsWithUsers);
      }

      // Calculate stats
      setStats({
        totalUsers: profilesData?.length || 0,
        totalPosts: postsData?.length || 0,
        totalBooks: booksData?.length || 0,
        totalReels: reelsData?.length || 0,
        verifiedUsers: profilesData?.filter(p => p.is_verified).length || 0,
        bannedUsers: bansData?.length || 0,
      });

    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load admin data.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const giftSubscription = async (userId: string, planId: string) => {
    setGiftingLoading(true);
    try {
      // Check if user already has a subscription
      const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .single();

      const subscriptionData = {
        user_id: userId,
        plan_id: planId,
        status: 'active' as const,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
      };

      if (existingSub) {
        await supabase
          .from('subscriptions')
          .update(subscriptionData)
          .eq('id', existingSub.id);
      } else {
        await supabase
          .from('subscriptions')
          .insert(subscriptionData);
      }

      toast({
        title: 'Success',
        description: 'Subscription gifted successfully!',
      });
      setGiftingUserId(null);
    } catch (error) {
      console.error('Error gifting subscription:', error);
      toast({
        title: 'Error',
        description: 'Failed to gift subscription.',
        variant: 'destructive',
      });
    } finally {
      setGiftingLoading(false);
    }
  };

  const banUser = async (userId: string) => {
    if (!currentUser || !banReason.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a reason for the ban.',
        variant: 'destructive',
      });
      return;
    }

    setBanLoading(true);
    try {
      // Calculate expiration date based on duration
      let expiresAt: string | null = null;
      if (banDuration !== 'permanent') {
        const now = new Date();
        const durationMap: Record<string, number> = {
          '1h': 60 * 60 * 1000,
          '24h': 24 * 60 * 60 * 1000,
          '7d': 7 * 24 * 60 * 60 * 1000,
          '30d': 30 * 24 * 60 * 60 * 1000,
          '90d': 90 * 24 * 60 * 60 * 1000,
        };
        expiresAt = new Date(now.getTime() + durationMap[banDuration]).toISOString();
      }

      const { error } = await supabase
        .from('user_bans')
        .insert({
          user_id: userId,
          banned_by: currentUser.id,
          reason: banReason.trim(),
          expires_at: expiresAt,
        });

      if (error) throw error;

      // Refresh bans
      const { data: bansData } = await supabase
        .from('user_bans')
        .select('*')
        .eq('is_active', true);
      
      setBans((bansData || []) as UserBan[]);
      setStats(prev => ({ ...prev, bannedUsers: bansData?.length || 0 }));

      toast({
        title: 'User Banned',
        description: `User has been banned ${banDuration === 'permanent' ? 'permanently' : `for ${banDuration}`}.`,
      });

      setBanDialogUserId(null);
      setBanReason('');
      setBanDuration('7d');
    } catch (error) {
      console.error('Error banning user:', error);
      toast({
        title: 'Error',
        description: 'Failed to ban user.',
        variant: 'destructive',
      });
    } finally {
      setBanLoading(false);
    }
  };

  const unbanUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('user_bans')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) throw error;

      setBans(prev => prev.filter(b => b.user_id !== userId));
      setStats(prev => ({ ...prev, bannedUsers: prev.bannedUsers - 1 }));

      toast({
        title: 'User Unbanned',
        description: 'User ban has been lifted.',
      });
    } catch (error) {
      console.error('Error unbanning user:', error);
      toast({
        title: 'Error',
        description: 'Failed to unban user.',
        variant: 'destructive',
      });
    }
  };

  const isUserBanned = (userId: string) => {
    return bans.some(b => b.user_id === userId && b.is_active);
  };

  const getUserBan = (userId: string) => {
    return bans.find(b => b.user_id === userId && b.is_active);
  };

  const deleteUser = async (userId: string) => {
    try {
      const { error } = await supabase.rpc('admin_delete_user', { target_user_id: userId });
      if (error) throw error;

      setUsers(prev => prev.filter(u => u.user_id !== userId));
      setBans(prev => prev.filter(b => b.user_id !== userId));
      
      toast({
        title: 'Success',
        description: 'User data deleted successfully.',
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete user.',
        variant: 'destructive',
      });
    }
  };

  const deleteAllUsers = async () => {
    setPurgeLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_purge_all_users', { keep_user_id: currentUser?.id });
      if (error) throw error;

      // Refresh data after purge
      await fetchData();
      
      toast({
        title: 'Success',
        description: `Deleted ${data} users.`,
      });
    } catch (error) {
      console.error('Error purging users:', error);
      toast({
        title: 'Error',
        description: 'Failed to purge users.',
        variant: 'destructive',
      });
    } finally {
      setPurgeLoading(false);
    }
  };

  const changeUserRole = async (userId: string, newRole: 'admin' | 'moderator' | 'user') => {
    try {
      if (newRole === 'user') {
        // Remove all elevated roles
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .in('role', ['admin', 'moderator']);
        
        if (error) throw error;
      } else {
        // Upsert the role
        const { error: deleteError } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .in('role', ['admin', 'moderator']);
        
        if (deleteError) throw deleteError;

        const { error: insertError } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newRole });
        
        if (insertError) throw insertError;
      }

      setUsers(prev => prev.map(u => 
        u.user_id === userId ? { ...u, role: newRole } : u
      ));

      toast({
        title: 'Success',
        description: `User role changed to ${newRole}.`,
      });
    } catch (error) {
      console.error('Error changing role:', error);
      toast({
        title: 'Error',
        description: 'Failed to change user role.',
        variant: 'destructive',
      });
    }
  };

  const toggleVerification = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_verified: !currentStatus })
        .eq('user_id', userId);

      if (error) throw error;

      setUsers(prev => prev.map(u => 
        u.user_id === userId ? { ...u, is_verified: !currentStatus } : u
      ));

      toast({
        title: 'Success',
        description: `User ${!currentStatus ? 'verified' : 'unverified'} successfully.`,
      });
    } catch (error) {
      console.error('Error toggling verification:', error);
      toast({
        title: 'Error',
        description: 'Failed to update verification status.',
        variant: 'destructive',
      });
    }
  };

  const deletePost = async (postId: string) => {
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;

      setPosts(prev => prev.filter(p => p.id !== postId));

      toast({
        title: 'Success',
        description: 'Post deleted successfully.',
      });
    } catch (error) {
      console.error('Error deleting post:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete post.',
        variant: 'destructive',
      });
    }
  };

  const deleteBook = async (bookId: string) => {
    try {
      const { error } = await supabase
        .from('books')
        .delete()
        .eq('id', bookId);

      if (error) throw error;

      setBooks(prev => prev.filter(b => b.id !== bookId));

      toast({
        title: 'Success',
        description: 'Book deleted successfully.',
      });
    } catch (error) {
      console.error('Error deleting book:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete book.',
        variant: 'destructive',
      });
    }
  };

  const deleteReel = async (reelId: string) => {
    try {
      const { error } = await supabase
        .from('reels')
        .delete()
        .eq('id', reelId);

      if (error) throw error;

      setReels(prev => prev.filter(r => r.id !== reelId));

      toast({
        title: 'Success',
        description: 'Reel deleted successfully.',
      });
    } catch (error) {
      console.error('Error deleting reel:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete reel.',
        variant: 'destructive',
      });
    }
  };

  const filteredUsers = users.filter(u =>
    u.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (authLoading || loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin && !isModerator) {
    return null;
  }

  return (
    <MainLayout>
      <div className="container py-6 px-4 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Admin Panel</h1>
              <p className="text-muted-foreground">
                {isAdmin ? 'Full administrative access' : 'Moderator access'}
              </p>
            </div>
          </div>
          
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2" disabled={purgeLoading}>
                  {purgeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash className="w-4 h-4" />}
                  Delete All Users
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-destructive">Delete All Users?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete ALL users and their data (posts, comments, books, etc.) except your own account. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteAllUsers} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalUsers}</p>
                  <p className="text-sm text-muted-foreground">Total Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalPosts}</p>
                  <p className="text-sm text-muted-foreground">Total Posts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-star/10 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-star" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalBooks}</p>
                  <p className="text-sm text-muted-foreground">Total Books</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
                  <Clapperboard className="w-5 h-5 text-pink-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalReels}</p>
                  <p className="text-sm text-muted-foreground">Total Reels</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-verified/10 flex items-center justify-center">
                  <BadgeCheck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.verifiedUsers}</p>
                  <p className="text-sm text-muted-foreground">Verified</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <Ban className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.bannedUsers}</p>
                  <p className="text-sm text-muted-foreground">Banned</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="users" className="gap-2">
              <Users className="w-4 h-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="posts" className="gap-2">
              <FileText className="w-4 h-4" />
              Posts
            </TabsTrigger>
            <TabsTrigger value="reels" className="gap-2">
              <Clapperboard className="w-4 h-4" />
              Reels
            </TabsTrigger>
            <TabsTrigger value="books" className="gap-2">
              <BookOpen className="w-4 h-4" />
              Books
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>Manage user accounts and verification status</CardDescription>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 w-full sm:w-64"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs">
                                  {getInitials(user.display_name)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium flex items-center gap-1">
                                  {user.display_name}
                                  {user.role === 'admin' && (
                                    <Hammer className="w-4 h-4 text-amber-500" />
                                  )}
                                  {user.is_verified && (
                                    <BadgeCheck className="w-4 h-4 text-primary" />
                                  )}
                                  {isUserBanned(user.user_id) && (
                                    <Ban className="w-4 h-4 text-destructive" />
                                  )}
                                </p>
                                <p className="text-sm text-muted-foreground">@{user.username}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {isAdmin && user.user_id !== currentUser?.id ? (
                              <Select 
                                value={user.role} 
                                onValueChange={(value: 'admin' | 'moderator' | 'user') => changeUserRole(user.user_id, value)}
                              >
                                <SelectTrigger className="w-[120px] h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="user">User</SelectItem>
                                  <SelectItem value="moderator">Moderator</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge 
                                variant={user.role === 'admin' ? 'default' : user.role === 'moderator' ? 'secondary' : 'outline'}
                                className={user.role === 'admin' ? 'bg-amber-500 hover:bg-amber-600' : ''}
                              >
                                {user.role === 'admin' && <Hammer className="w-3 h-3 mr-1" />}
                                {user.role}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {isUserBanned(user.user_id) ? (
                              <Badge variant="destructive" className="gap-1">
                                <Ban className="w-3 h-3" />
                                Banned
                              </Badge>
                            ) : (
                              <Badge variant={user.privacy === 'public' ? 'outline' : 'secondary'}>
                                {user.privacy}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(user.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleVerification(user.user_id, user.is_verified)}
                                title={user.is_verified ? 'Remove verification' : 'Verify user'}
                              >
                                {user.is_verified ? (
                                  <UserX className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                  <UserCheck className="w-4 h-4 text-primary" />
                                )}
                              </Button>
                              
                              {/* Gift Subscription Dialog */}
                              <Dialog open={giftingUserId === user.user_id} onOpenChange={(open) => setGiftingUserId(open ? user.user_id : null)}>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" title="Gift subscription">
                                    <Gift className="w-4 h-4 text-primary" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Gift Subscription</DialogTitle>
                                    <DialogDescription>
                                      Gift a subscription plan to {user.display_name} (@{user.username})
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="grid gap-3 py-4">
                                    {plans.map((plan) => (
                                      <Button
                                        key={plan.id}
                                        variant={plan.tier === 'premium' ? 'default' : 'outline'}
                                        className={plan.tier === 'premium' ? 'bg-amber-500 hover:from-amber-600 hover:to-orange-600' : ''}
                                        onClick={() => giftSubscription(user.user_id, plan.id)}
                                        disabled={giftingLoading}
                                      >
                                        {plan.tier === 'premium' && <Crown className="w-4 h-4 mr-2" />}
                                        {plan.name} ({plan.tier})
                                      </Button>
                                    ))}
                                  </div>
                                </DialogContent>
                              </Dialog>

                              {/* Ban/Unban User Button */}
                              {isAdmin && user.role !== 'admin' && (
                                isUserBanned(user.user_id) ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => unbanUser(user.user_id)}
                                    className="text-green-600 hover:text-green-700"
                                    title="Unban user"
                                  >
                                    <ShieldOff className="w-4 h-4" />
                                  </Button>
                                ) : (
                                  <Dialog open={banDialogUserId === user.user_id} onOpenChange={(open) => {
                                    setBanDialogUserId(open ? user.user_id : null);
                                    if (!open) {
                                      setBanReason('');
                                      setBanDuration('7d');
                                    }
                                  }}>
                                    <DialogTrigger asChild>
                                      <Button variant="ghost" size="sm" title="Ban user" className="text-destructive hover:text-destructive">
                                        <Ban className="w-4 h-4" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                      <DialogHeader>
                                        <DialogTitle className="flex items-center gap-2">
                                          <Ban className="w-5 h-5 text-destructive" />
                                          Ban User
                                        </DialogTitle>
                                        <DialogDescription>
                                          Ban {user.display_name} (@{user.username}) from using the platform.
                                        </DialogDescription>
                                      </DialogHeader>
                                      <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                          <Label htmlFor="ban-reason">Reason for ban</Label>
                                          <Textarea
                                            id="ban-reason"
                                            placeholder="Describe why this user is being banned..."
                                            value={banReason}
                                            onChange={(e) => setBanReason(e.target.value)}
                                            rows={3}
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label htmlFor="ban-duration">Duration</Label>
                                          <Select value={banDuration} onValueChange={setBanDuration}>
                                            <SelectTrigger>
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="1h">1 Hour</SelectItem>
                                              <SelectItem value="24h">24 Hours</SelectItem>
                                              <SelectItem value="7d">7 Days</SelectItem>
                                              <SelectItem value="30d">30 Days</SelectItem>
                                              <SelectItem value="90d">90 Days</SelectItem>
                                              <SelectItem value="permanent">Permanent</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </div>
                                      <DialogFooter>
                                        <Button variant="outline" onClick={() => setBanDialogUserId(null)}>
                                          Cancel
                                        </Button>
                                        <Button 
                                          variant="destructive" 
                                          onClick={() => banUser(user.user_id)}
                                          disabled={banLoading || !banReason.trim()}
                                        >
                                          {banLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Ban className="w-4 h-4 mr-2" />}
                                          Ban User
                                        </Button>
                                      </DialogFooter>
                                    </DialogContent>
                                  </Dialog>
                                )
                              )}

                              {/* Delete User Button */}
                              {isAdmin && user.role !== 'admin' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteUser(user.user_id)}
                                  className="text-destructive hover:text-destructive"
                                  title="Delete user data"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Posts Tab */}
          <TabsContent value="posts">
            <Card>
              <CardHeader>
                <CardTitle>Post Management</CardTitle>
                <CardDescription>Review and moderate user posts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Author</TableHead>
                        <TableHead>Content</TableHead>
                        <TableHead>Visibility</TableHead>
                        <TableHead>Engagement</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {posts.map((post) => (
                        <TableRow key={post.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{post.user.display_name}</p>
                              <p className="text-sm text-muted-foreground">@{post.user.username}</p>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {post.content.substring(0, 100)}...
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{post.visibility}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              ⭐ {post.star_count} · 💬 {post.comment_count}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(post.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deletePost(post.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Books Tab */}
          <TabsContent value="books">
            <Card>
              <CardHeader>
                <CardTitle>Book Management</CardTitle>
                <CardDescription>Review and manage published books</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Author</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {books.map((book) => (
                        <TableRow key={book.id}>
                          <TableCell className="font-medium">{book.title}</TableCell>
                          <TableCell>
                            <div>
                              <p>{book.author.display_name}</p>
                              <p className="text-sm text-muted-foreground">@{book.author.username}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={book.status === 'published' ? 'default' : 'secondary'}>
                              {book.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(book.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteBook(book.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reels Tab */}
          <TabsContent value="reels">
            <Card>
              <CardHeader>
                <CardTitle>Reels Management</CardTitle>
                <CardDescription>Review and moderate user reels</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Creator</TableHead>
                        <TableHead>Caption</TableHead>
                        <TableHead>Stats</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reels.map((reel) => (
                        <TableRow key={reel.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{reel.user.display_name}</p>
                              <p className="text-sm text-muted-foreground">@{reel.user.username}</p>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {reel.caption || <span className="text-muted-foreground italic">No caption</span>}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Eye className="w-3 h-3" />
                                {reel.view_count || 0}
                              </span>
                              <span>❤️ {reel.like_count || 0}</span>
                              <span>💬 {reel.comment_count || 0}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(reel.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteReel(reel.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
