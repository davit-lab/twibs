import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import AudioPlayer from '@/components/library/AudioPlayer';
import PdfViewer from '@/components/library/PdfViewer';
import FollowButton from '@/components/social/FollowButton';
import { useAuth } from '@/contexts/AuthContext';
import { useCollections } from '@/hooks/useLibraryItems';
import type { LibraryItem } from '@/hooks/useLibraryItems';
import { displayInitials } from '@/lib/library-content';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Download,
  Share2,
  Eye,
  MoreHorizontal,
  Send,
  Plus,
  Trash2,
  Edit,
  Lock,
  Users,
  Globe,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

const TYPE_LABELS: Record<LibraryItem['type'], string> = {
  audio: 'Audio',
  pdf: 'PDF',
  image: 'Image',
  video: 'Video',
};

export default function LibraryItemDetail() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [item, setItem] = useState<LibraryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editVisibility, setEditVisibility] = useState<LibraryItem['visibility']>('public');
  const [editAllowDownloads, setEditAllowDownloads] = useState(true);
  const [editAllowComments, setEditAllowComments] = useState(true);

  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const { collections, createCollection, addToCollection } = useCollections();

  const viewIncrementedRef = useRef(false);

  useEffect(() => {
    if (itemId) {
      fetchItem();
      fetchComments();
    }
  }, [itemId]);

  const fetchItem = async () => {
    if (!itemId) return;
    try {
      const { data, error } = await supabase
        .from('library_items')
        .select('*')
        .eq('id', itemId)
        .single();

      if (error) throw error;

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, is_verified')
        .eq('user_id', data.user_id)
        .single();

      setItem({
        ...data,
        type: data.type as LibraryItem['type'],
        visibility: data.visibility as LibraryItem['visibility'],
        profiles: profile || undefined,
      });
      setLikeCount(data.like_count);

      if (!viewIncrementedRef.current) {
        viewIncrementedRef.current = true;
        incrementView(data as LibraryItem);
      }

      if (user) {
        const { data: like } = await supabase
          .from('library_likes')
          .select('id')
          .eq('user_id', user.id)
          .eq('item_id', itemId)
          .maybeSingle();

        setIsLiked(!!like);
      }
    } catch (err) {
      console.error('Error fetching item:', err);
      toast({ variant: 'destructive', title: 'Item not found' });
      navigate('/library');
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    if (!itemId) return;
    try {
      const { data, error } = await supabase
        .from('library_comments')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const userIds = [...new Set(data?.map((d) => d.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      setComments(
        data?.map((c) => ({
          ...c,
          profiles: profileMap.get(c.user_id) as Comment['profiles'],
        })) || []
      );
    } catch (err) {
      console.error('Error fetching comments:', err);
    }
  };

  const incrementView = async (currentItem: LibraryItem) => {
    try {
      await supabase
        .from('library_items')
        .update({ view_count: (currentItem.view_count || 0) + 1 })
        .eq('id', itemId);
    } catch (err) {
      // Silent fail
    }
  };

  const handleLike = async () => {
    if (!user) {
      toast({ title: 'Please sign in to like' });
      return;
    }
    if (!item) return;

    try {
      if (isLiked) {
        await supabase
          .from('library_likes')
          .delete()
          .eq('user_id', user.id)
          .eq('item_id', itemId);
      } else {
        await supabase
          .from('library_likes')
          .insert({ user_id: user.id, item_id: itemId });
      }
      const nextLiked = !isLiked;
      const nextCount = Math.max(0, likeCount + (nextLiked ? 1 : -1));
      setIsLiked(nextLiked);
      setLikeCount(nextCount);
      await supabase
        .from('library_items')
        .update({ like_count: nextCount })
        .eq('id', itemId);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to update like' });
    }
  };

  const handleDownload = async () => {
    if (!item) return;
    try {
      await supabase
        .from('library_items')
        .update({ download_count: (item.download_count || 0) + 1 })
        .eq('id', itemId);
      window.open(item.file_url, '_blank');
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to download' });
    }
  };

  const handleShare = async () => {
    try {
      await navigator.share({
        title: item?.title,
        url: window.location.href,
      });
    } catch (err) {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: 'Link copied!' });
    }
  };

  const handleComment = async () => {
    if (!user || !newComment.trim() || !itemId) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('library_comments')
        .insert({
          user_id: user.id,
          item_id: itemId,
          content: newComment.trim(),
        })
        .select('*')
        .single();

      if (error) throw error;

      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .eq('user_id', user.id)
        .single();

      const newCommentData: Comment = {
        ...data,
        profiles: profile as Comment['profiles'],
      };

      setComments((prev) => [...prev, newCommentData]);
      setNewComment('');
      setItem((prev) =>
        prev ? { ...prev, comment_count: (prev.comment_count || 0) + 1 } : prev
      );
      await supabase
        .from('library_items')
        .update({ comment_count: (item?.comment_count || 0) + 1 })
        .eq('id', itemId);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to post comment' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!itemId) return;
    if (!confirm('Delete this item? This cannot be undone.')) return;
    try {
      const { error } = await supabase
        .from('library_items')
        .delete()
        .eq('id', itemId);
      if (error) throw error;
      toast({ title: 'Item deleted' });
      navigate('/library');
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to delete' });
    }
  };

  const openEdit = () => {
    if (!item) return;
    setEditTitle(item.title);
    setEditDescription(item.description || '');
    setEditTags((item.tags || []).join(', '));
    setEditVisibility(item.visibility);
    setEditAllowDownloads(item.allow_downloads);
    setEditAllowComments(item.allow_comments);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!itemId || !editTitle.trim()) return;
    setSaving(true);
    try {
      const tags = editTags
        .split(',')
        .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean)
        .slice(0, 10);

      const { error } = await supabase
        .from('library_items')
        .update({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          tags,
          visibility: editVisibility,
          allow_downloads: editAllowDownloads,
          allow_comments: editAllowComments,
        })
        .eq('id', itemId);

      if (error) throw error;
      toast({ title: 'Item updated' });
      setEditOpen(false);
      setItem((prev) =>
        prev
          ? {
              ...prev,
              title: editTitle.trim(),
              description: editDescription.trim() || null,
              tags,
              visibility: editVisibility,
              allow_downloads: editAllowDownloads,
              allow_comments: editAllowComments,
            }
          : prev
      );
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const fetchCollections = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('collections')
      .select('id, name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    return data || [];
  };

  const getVisibilityIcon = () => {
    switch (item?.visibility) {
      case 'private':
        return <Lock className="h-4 w-4" />;
      case 'followers':
        return <Users className="h-4 w-4" />;
      default:
        return <Globe className="h-4 w-4" />;
    }
  };

  const typeStyles: Record<string, string> = {
    audio: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5',
    pdf: 'text-rose-500 border-rose-500/20 bg-rose-500/5',
    image: 'text-sky-500 border-sky-500/20 bg-sky-500/5',
    video: 'text-amber-500 border-amber-500/20 bg-amber-500/5',
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="aspect-video rounded-2xl mb-6" />
          <Skeleton className="h-8 w-2/3 mb-4" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      </MainLayout>
    );
  }

  if (!item) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-28 h-28 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <MessageCircle className="h-14 w-14 text-primary" />
          </div>
          <h2 className="text-2xl font-black mb-3">Item not found</h2>
          <Button onClick={() => navigate('/library')} className="h-12 px-8 rounded-2xl font-bold shadow-lg shadow-primary/20">
            Back to Library
          </Button>
        </div>
      </MainLayout>
    );
  }

  const isOwner = user?.id === item.user_id;

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-6 gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {item.type === 'audio' && (
          <AudioPlayer
            src={item.file_url}
            title={item.title}
            artist={item.profiles?.display_name}
            coverUrl={item.thumbnail_url || undefined}
            className="mb-6"
          />
        )}

        {item.type === 'video' && (
          <div className="mb-6 overflow-hidden rounded-3xl border border-border/60 bg-muted shadow-lg">
            <video
              src={item.file_url}
              poster={item.thumbnail_url || undefined}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full bg-black object-contain"
            />
          </div>
        )}

        {item.type === 'pdf' && (
          <div className="mb-6">
            <div className="aspect-[3/4] max-h-[500px] bg-rose-500/5 rounded-3xl flex items-center justify-center border border-rose-500/20">
              <div className="text-center p-8">
                <div className="w-24 h-24 mx-auto mb-5 bg-rose-500/10 rounded-2xl flex items-center justify-center">
                  <span className="text-4xl font-black text-rose-500">PDF</span>
                </div>
                <h3 className="font-black text-xl mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  {item.page_count ? `${item.page_count} pages` : 'PDF Document'}
                </p>
                <div className="flex gap-3 justify-center">
                  <Button onClick={() => setShowPdfViewer(true)} className="h-11 px-6 rounded-xl font-bold shadow-lg shadow-rose-500/20">
                    Open Viewer
                  </Button>
                  {item.allow_downloads && (
                    <Button variant="outline" onClick={handleDownload} className="h-11 px-6 rounded-xl font-bold border-border/60">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {item.type === 'image' && (
          <div className="mb-6 rounded-3xl overflow-hidden border border-border/60 shadow-lg">
            <img
              src={item.file_url}
              alt={item.title}
              className="w-full max-h-[70vh] object-contain bg-muted"
            />
          </div>
        )}

        <div className="flex items-start justify-between mb-5">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className={cn("text-xs font-bold uppercase tracking-wider border", typeStyles[item.type] || typeStyles.image)}>
                {TYPE_LABELS[item.type]}
              </Badge>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {getVisibilityIcon()}
                {item.visibility}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">{item.title}</h1>
          </div>

          {isOwner && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                <DropdownMenuItem className="font-bold" onClick={openEdit}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDelete} className="text-destructive font-bold">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {item.profiles && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/60 hover:border-primary/30 transition-all mb-5">
            <Link to={`/profile/${item.profiles.username}`} className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar className="h-11 w-11 border border-border/60">
                <AvatarImage src={item.profiles.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                  {displayInitials(item.profiles.display_name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-bold truncate">{item.profiles.display_name}</p>
                <p className="text-sm text-muted-foreground">@{item.profiles.username}</p>
              </div>
            </Link>
            <FollowButton
              targetUserId={item.user_id}
              targetUsername={item.profiles.username}
            />
          </div>
        )}

        {item.description && (
          <p className="text-muted-foreground mb-5 whitespace-pre-wrap leading-relaxed">
            {item.description}
          </p>
        )}

        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {item.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="rounded-xl font-bold">
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between py-5 border-y border-border/60 mb-8">
          <div className="flex items-center gap-5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Eye className="h-4 w-4" />
              {item.view_count} views
            </span>
            <span className="flex items-center gap-1.5">
              <Download className="h-4 w-4" />
              {item.download_count} downloads
            </span>
            <span>
              {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {user && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCollectionPickerOpen(true)}
                className="rounded-xl font-bold gap-1.5"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add to collection</span>
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLike}
              className={cn(
                "rounded-xl font-bold gap-1.5",
                isLiked ? "text-red-500 hover:text-red-600" : "hover:text-red-500"
              )}
            >
              <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
              {likeCount}
            </Button>

            {item.allow_downloads && (
              <Button variant="ghost" size="sm" onClick={handleDownload} className="rounded-xl font-bold gap-1.5">
                <Download className="h-4 w-4" />
                Download
              </Button>
            )}

            <Button variant="ghost" size="sm" onClick={handleShare} className="rounded-xl">
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {item.allow_comments && (
          <div>
            <h2 className="text-lg font-black mb-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-primary" />
              </div>
              Comments ({item.comment_count || comments.length})
            </h2>

            {user ? (
              <div className="flex gap-3 mb-8">
                <Avatar className="h-10 w-10 border border-border/60">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">U</AvatarFallback>
                </Avatar>
                <div className="flex-1 flex gap-2">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    rows={1}
                    className="resize-none rounded-xl border-border/60 focus:border-primary/50"
                  />
                  <Button
                    size="icon"
                    disabled={!newComment.trim() || submitting}
                    onClick={handleComment}
                    className="rounded-xl h-11 w-11"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground mb-8 py-4 bg-card rounded-2xl border border-border/60">
                <Link to="/auth" className="text-primary hover:underline font-bold">Sign in</Link> to comment
              </p>
            )}

            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3 p-4 rounded-2xl bg-card border border-border/60">
                  <Avatar className="h-9 w-9 border border-border/60">
                    <AvatarImage src={comment.profiles.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                      {displayInitials(comment.profiles?.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        to={`/profile/${comment.profiles.username}`}
                        className="font-bold text-sm hover:text-primary transition-colors"
                      >
                        {comment.profiles.display_name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{comment.content}</p>
                  </div>
                </div>
              ))}

              {comments.length === 0 && (
                <p className="text-center text-muted-foreground py-12">
                  No comments yet. Be the first!
                </p>
              )}
            </div>
          </div>
        )}

        {showPdfViewer && item.type === 'pdf' && (
          <PdfViewer
            bookTitle={item.title}
            onClose={() => setShowPdfViewer(false)}
            url={item.file_url}
          />
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
            <DialogDescription>Update how this item appears in the library.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-tags">Tags (comma separated)</Label>
              <Input
                id="edit-tags"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="love, study, notes"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={editVisibility} onValueChange={(v: LibraryItem['visibility']) => setEditVisibility(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public - Anyone can see</SelectItem>
                  <SelectItem value="followers">Followers only</SelectItem>
                  <SelectItem value="private">Private - Only you</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-dl">Allow downloads</Label>
                <Switch id="edit-dl" checked={editAllowDownloads} onCheckedChange={setEditAllowDownloads} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-cm">Allow comments</Label>
                <Switch id="edit-cm" checked={editAllowComments} onCheckedChange={setEditAllowComments} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editTitle.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CollectionPickerDialog
        open={collectionPickerOpen}
        onOpenChange={setCollectionPickerOpen}
        itemId={item.id}
        fetchCollections={fetchCollections}
        onCreateCollection={async (name) => createCollection(name)}
        onAdd={async (collectionId) => addToCollection(collectionId, item.id)}
      />
    </MainLayout>
  );
}

interface CollectionPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  fetchCollections: () => Promise<{ id: string; name: string }[]>;
  onCreateCollection: (name: string) => Promise<{ id: string } | null>;
  onAdd: (collectionId: string) => Promise<boolean>;
}

function CollectionPickerDialog({
  open,
  onOpenChange,
  fetchCollections,
  onCreateCollection,
  onAdd,
}: CollectionPickerDialogProps) {
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setBusy(true);
      fetchCollections()
        .then(setCollections)
        .finally(() => setBusy(false));
    }
  }, [open]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const created = await onCreateCollection(newName.trim());
    if (created) {
      setCollections((prev) => [...prev, { id: created.id, name: newName.trim() }]);
      setNewName('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to collection</DialogTitle>
          <DialogDescription>Pick a collection to save this item to.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {collections.map((c) => (
            <button
              key={c.id}
              onClick={async () => {
                const ok = await onAdd(c.id);
                if (ok) onOpenChange(false);
              }}
              className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3 text-sm font-semibold transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <span>{c.name}</span>
              <Plus className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          {collections.length === 0 && !busy && (
            <p className="text-center text-sm text-muted-foreground py-4">
              No collections yet. Create one below.
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New collection name"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Button variant="outline" onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}