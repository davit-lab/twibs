import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useBookActions } from '@/hooks/useBooks';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Plus, FileText, Upload, DollarSign, Loader2, X } from 'lucide-react';

interface CreateBookDialogProps {
  onBookCreated?: () => void;
  children?: React.ReactNode;
}

export default function CreateBookDialog({ onBookCreated, children }: CreateBookDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { createBook } = useBookActions();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPdfUpload, setIsPdfUpload] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [price, setPrice] = useState('');
  const [isFree, setIsFree] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          variant: 'destructive',
          title: 'Invalid file type',
          description: 'Please select a PDF file.',
        });
        return;
      }
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        toast({
          variant: 'destructive',
          title: 'File too large',
          description: 'PDF must be under 50MB.',
        });
        return;
      }
      setPdfFile(file);
    }
  };

  const uploadPdf = async (): Promise<string | null> => {
    if (!pdfFile || !user) return null;

    const fileExt = 'pdf';
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    setUploadProgress(10);

    const { error: uploadError } = await supabase.storage
      .from('book-pdfs')
      .upload(fileName, pdfFile, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('PDF upload error:', uploadError);
      throw new Error('Failed to upload PDF');
    }

    setUploadProgress(80);

    const { data } = supabase.storage
      .from('book-pdfs')
      .getPublicUrl(fileName);

    setUploadProgress(100);
    return data.publicUrl;
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    if (isPdfUpload && !pdfFile) {
      toast({
        variant: 'destructive',
        title: 'PDF required',
        description: 'Please select a PDF file to upload.',
      });
      return;
    }

    setIsCreating(true);
    setUploadProgress(0);

    try {
      let pdfUrl: string | null = null;

      if (isPdfUpload && pdfFile) {
        pdfUrl = await uploadPdf();
      }

      const priceValue = isFree ? 0 : parseFloat(price) || 0;

      // Create book with extended data
      const { data, error } = await supabase
        .from('books')
        .insert({
          author_id: user!.id,
          title: title.trim(),
          description: description.trim() || null,
          pdf_url: pdfUrl,
          price: priceValue,
          is_free: isFree,
          status: isPdfUpload ? 'published' : 'draft', // Auto-publish PDF books
        })
        .select()
        .single();

      if (error) throw error;

      toast({ 
        title: isPdfUpload ? 'Book published!' : 'Book created', 
        description: isPdfUpload ? 'Your PDF book is now live.' : 'Start adding chapters!' 
      });

      // Reset form
      setTitle('');
      setDescription('');
      setPdfFile(null);
      setPrice('');
      setIsFree(true);
      setIsPdfUpload(false);
      setOpen(false);
      onBookCreated?.();

      if (!isPdfUpload && data) {
        navigate(`/library/book/${data.id}/edit`);
      }
    } catch (error: any) {
      console.error('Error creating book:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to create book',
      });
    } finally {
      setIsCreating(false);
      setUploadProgress(0);
    }
  };

  const removePdf = () => {
    setPdfFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Book
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Book</DialogTitle>
          <DialogDescription>
            Write chapters or upload a complete PDF book.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Book Type Toggle */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Upload PDF instead</span>
            </div>
            <Switch
              checked={isPdfUpload}
              onCheckedChange={setIsPdfUpload}
            />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter book title"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's your book about?"
              rows={3}
            />
          </div>

          {/* PDF Upload Section */}
          {isPdfUpload && (
            <>
              <div className="space-y-2">
                <Label>PDF File</Label>
                {pdfFile ? (
                  <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <FileText className="h-8 w-8 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{pdfFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(pdfFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={removePdf}
                      className="h-8 w-8"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                  >
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Click to upload PDF (max 50MB)
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {/* Pricing Section */}
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Free book</span>
                  </div>
                  <Switch
                    checked={isFree}
                    onCheckedChange={setIsFree}
                  />
                </div>

                {!isFree && (
                  <div className="space-y-2">
                    <Label htmlFor="price">Price (USD)</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="9.99"
                        className="pl-9"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Set the price readers will pay for your book.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Upload Progress */}
          {isCreating && uploadProgress > 0 && uploadProgress < 100 && (
            <div className="space-y-2">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Uploading... {uploadProgress}%
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreate} 
            disabled={!title.trim() || isCreating || (isPdfUpload && !pdfFile)}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isPdfUpload ? 'Publishing...' : 'Creating...'}
              </>
            ) : (
              isPdfUpload ? 'Publish Book' : 'Create Book'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
