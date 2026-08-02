import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { useBook, useBookActions, useChapterActions, type Chapter } from '@/hooks/useBooks';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Book,
  Save,
  Upload,
  Plus,
  Trash2,
  GripVertical,
  ArrowLeft,
  Send,
  Eye,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const GENRES = [
  'Fantasy',
  'Science Fiction',
  'Romance',
  'Mystery',
  'Thriller',
  'Horror',
  'Historical Fiction',
  'Literary Fiction',
  'Non-Fiction',
  'Biography',
  'Self-Help',
  'Poetry',
  'Other',
];

export default function BookEditor() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { book, chapters, isLoading, refetch } = useBook(bookId);
  const { updateBook, publishBook, deleteBook } = useBookActions();
  const { createChapter, updateChapter, deleteChapter } = useChapterActions();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [isSavingChapter, setIsSavingChapter] = useState(false);
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | null>(null);

  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [showNewChapterDialog, setShowNewChapterDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [chapterToDelete, setChapterToDelete] = useState<string | null>(null);

  // Initialize form with book data
  useEffect(() => {
    if (book) {
      setTitle(book.title);
      setDescription(book.description || '');
      setGenre(book.genre || '');
      setCoverUrl(book.cover_url || '');
    }
  }, [book]);

  // Select first chapter by default
  useEffect(() => {
    if (chapters.length > 0 && !selectedChapter) {
      selectChapter(chapters[0]);
    }
  }, [chapters]);

  const selectChapter = (chapter: Chapter) => {
    // Save current chapter before switching
    if (selectedChapter && chapterContent !== selectedChapter.content) {
      saveChapter();
    }
    setSelectedChapter(chapter);
    setChapterTitle(chapter.title);
    setChapterContent(chapter.content);
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !bookId) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${bookId}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('book-covers')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('book-covers')
        .getPublicUrl(filePath);

      setCoverUrl(publicUrl);
      await updateBook(bookId, { cover_url: publicUrl });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error.message,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const saveBookDetails = async () => {
    if (!bookId) return;
    
    setIsSaving(true);
    await updateBook(bookId, {
      title,
      description,
      genre: genre || null,
    });
    setIsSaving(false);
  };

  const saveChapter = async () => {
    if (!selectedChapter) return;

    setIsSavingChapter(true);
    await updateChapter(selectedChapter.id, {
      title: chapterTitle,
      content: chapterContent,
    });
    setIsSavingChapter(false);
    refetch();
  };

  // Auto-save chapter content
  useEffect(() => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);

    if (selectedChapter && chapterContent !== selectedChapter.content) {
      const timer = setTimeout(() => {
        saveChapter();
      }, 2000);
      setAutoSaveTimer(timer);
    }

    return () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
    };
  }, [chapterContent]);

  const handleCreateChapter = async () => {
    if (!bookId || !newChapterTitle.trim()) return;

    const chapter = await createChapter(bookId, newChapterTitle.trim(), chapters.length);
    if (chapter) {
      setNewChapterTitle('');
      setShowNewChapterDialog(false);
      refetch();
      selectChapter(chapter);
    }
  };

  const handleDeleteChapter = async () => {
    if (!chapterToDelete) return;

    const success = await deleteChapter(chapterToDelete);
    if (success) {
      setChapterToDelete(null);
      setShowDeleteDialog(false);
      if (selectedChapter?.id === chapterToDelete) {
        setSelectedChapter(null);
        setChapterTitle('');
        setChapterContent('');
      }
      refetch();
    }
  };

  const handlePublish = async () => {
    if (!bookId) return;

    if (chapters.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Cannot publish',
        description: 'Add at least one chapter before publishing.',
      });
      return;
    }

    setIsPublishing(true);
    const success = await publishBook(bookId);
    setIsPublishing(false);

    if (success) {
      refetch();
    }
  };

  const isAuthor = user && book?.author_id === user.id;

  if (isLoading) {
    return (
      <MainLayout>
        <div className="p-4 md:p-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="grid md:grid-cols-3 gap-6">
            <Skeleton className="h-96" />
            <Skeleton className="h-96 md:col-span-2" />
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!book || !isAuthor) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto p-4 md:p-6 text-center py-16">
          <Book className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-medium mb-2">Access denied</h2>
          <p className="text-muted-foreground mb-4">
            You don't have permission to edit this book.
          </p>
          <Button asChild>
            <Link to="/library">Back to Library</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/library/book/${bookId}`}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-xl font-semibold">Edit Book</h1>
            {book.status === 'draft' && <Badge variant="secondary">Draft</Badge>}
            {book.status === 'published' && <Badge>Published</Badge>}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to={`/library/book/${bookId}`}>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Link>
            </Button>
            {book.status === 'draft' && (
              <Button onClick={handlePublish} disabled={isPublishing}>
                <Send className="h-4 w-4 mr-2" />
                {isPublishing ? 'Publishing...' : 'Publish'}
              </Button>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Sidebar - Book Details & Chapters */}
          <div className="space-y-6">
            {/* Cover Upload */}
            <div className="space-y-2">
              <Label>Cover Image</Label>
              <div className="aspect-[3/4] bg-muted rounded-lg overflow-hidden relative group">
                {coverUrl ? (
                  <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Book className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
                <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <div className="text-white text-center">
                    <Upload className="h-6 w-6 mx-auto mb-1" />
                    <span className="text-sm">{isUploading ? 'Uploading...' : 'Upload Cover'}</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCoverUpload}
                    className="hidden"
                    disabled={isUploading}
                  />
                </label>
              </div>
            </div>

            {/* Book Details */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={saveBookDetails}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="genre">Genre</Label>
                <Select value={genre} onValueChange={(v) => { setGenre(v); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select genre" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENRES.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={saveBookDetails}
                  rows={4}
                />
              </div>

              <Button 
                variant="outline" 
                className="w-full" 
                onClick={saveBookDetails}
                disabled={isSaving}
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Details'}
              </Button>
            </div>
          </div>

          {/* Main Content - Chapters */}
          <div className="lg:col-span-3 space-y-4">
            {/* Chapter List */}
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Chapters ({chapters.length})</h2>
              <Button size="sm" onClick={() => setShowNewChapterDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Chapter
              </Button>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2">
              {chapters.map((chapter, index) => (
                <button
                  key={chapter.id}
                  onClick={() => selectChapter(chapter)}
                  className={cn(
                    "flex-shrink-0 p-3 rounded-lg border text-left transition-colors min-w-[150px]",
                    selectedChapter?.id === chapter.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <span className="text-xs text-muted-foreground">Chapter {index + 1}</span>
                  <p className="font-medium truncate text-sm">{chapter.title}</p>
                  <span className="text-xs text-muted-foreground">
                    {chapter.word_count} words
                  </span>
                </button>
              ))}
              {chapters.length === 0 && (
                <p className="text-muted-foreground text-sm py-4">
                  No chapters yet. Add your first chapter to get started.
                </p>
              )}
            </div>

            {/* Chapter Editor */}
            {selectedChapter && (
              <div className="space-y-4 border rounded-lg p-4">
                <div className="flex items-center justify-between gap-4">
                  <Input
                    value={chapterTitle}
                    onChange={(e) => setChapterTitle(e.target.value)}
                    onBlur={saveChapter}
                    placeholder="Chapter title"
                    className="text-lg font-medium"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {isSavingChapter ? 'Saving...' : 'Auto-saved'}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setChapterToDelete(selectedChapter.id);
                        setShowDeleteDialog(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <Textarea
                  value={chapterContent}
                  onChange={(e) => setChapterContent(e.target.value)}
                  placeholder="Start writing your chapter..."
                  className="min-h-[500px] font-mono"
                />

                <div className="flex justify-between items-center text-sm text-muted-foreground">
                  <span>
                    {chapterContent.split(/\s+/).filter(Boolean).length} words
                  </span>
                  <Button onClick={saveChapter} disabled={isSavingChapter}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Chapter
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Chapter Dialog */}
      <Dialog open={showNewChapterDialog} onOpenChange={setShowNewChapterDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Chapter</DialogTitle>
            <DialogDescription>
              Enter a title for your new chapter.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newChapterTitle}
            onChange={(e) => setNewChapterTitle(e.target.value)}
            placeholder="Chapter title"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewChapterDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateChapter} disabled={!newChapterTitle.trim()}>
              Create Chapter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Chapter Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chapter?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The chapter and all its content will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteChapter} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
