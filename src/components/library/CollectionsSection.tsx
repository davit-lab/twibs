import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  useCollections,
  useCollectionItems,
  useLibraryItems,
  type Collection,
} from '@/hooks/useLibraryItems';
import { libraryItemToContent, kindLabel } from '@/lib/library-content';
import CollectionCard from '@/components/library/CollectionCard';
import ContentCard from '@/components/library/content/ContentCard';
import UploadItemModal from '@/components/library/UploadItemModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Plus, Trash2, FolderOpen, Loader2, Upload, Headphones, FileText, Image as ImageIcon, Video } from 'lucide-react';

const TYPE_ICON = { audio: Headphones, pdf: FileText, image: ImageIcon, video: Video } as const;

export default function CollectionsSection() {
  const { user } = useAuth();
  const { collections, loading, createCollection, removeFromCollection, deleteCollection, refetch } = useCollections(user?.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [coverMap, setCoverMap] = useState<Record<string, string | null>>({});
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!collections.length) {
      setCoverMap({});
      return;
    }
    let cancelled = false;
    const loadCovers = async () => {
      const { data: entries } = await supabase
        .from('collection_items')
        .select('collection_id, item_id')
        .in('collection_id', collections.map((c) => c.id))
        .order('created_at', { ascending: false });

      const itemIds = [...new Set(entries?.map((e) => e.item_id) || [])];
      let thumbMap = new Map<string, string | null>();
      if (itemIds.length) {
        const { data: items } = await supabase
          .from('library_items')
          .select('id, thumbnail_url, file_url, type')
          .in('id', itemIds);
        thumbMap = new Map(
          (items || []).map((i) => [
            i.id,
            i.type === 'image' ? (i.file_url as string | null) : (i.thumbnail_url as string | null),
          ])
        );
      }
      if (cancelled) return;
      const map: Record<string, string | null> = {};
      (entries || []).forEach((e) => {
        if (map[e.collection_id] == null) map[e.collection_id] = thumbMap.get(e.item_id) || null;
      });
      setCoverMap(map);
    };
    loadCovers();
    return () => {
      cancelled = true;
    };
  }, [collections]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteCollection(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (selectedId === deleteTarget.id) setSelectedId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <FolderOpen className="h-4 w-4 text-primary" />
          </span>
          <h2 className="text-lg font-bold tracking-tight">Collections</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            {collections.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <UploadItemModal onSuccess={refetch}>
            <Button variant="outline" className="h-10 rounded-xl gap-1.5 border-border/60 font-semibold">
              <Upload className="h-4 w-4" />
              Upload
            </Button>
          </UploadItemModal>
          <CreateCollectionDialog onCreate={refetch} />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      ) : collections.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/80 bg-card/50 px-8 py-20 text-center">
          <FolderOpen className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" />
          <h3 className="text-xl font-bold tracking-tight">No collections yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Upload audio, PDFs, images or videos, then group them into curated collections.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <UploadItemModal onSuccess={refetch}>
              <Button variant="outline" className="rounded-xl border-border/60 px-5 font-semibold">
                <Upload className="h-4 w-4" />
                Upload something
              </Button>
            </UploadItemModal>
            <CreateCollectionDialog onCreate={refetch}>
              <Button className="rounded-xl px-6 font-semibold">
                <Plus className="h-4 w-4" />
                Create collection
              </Button>
            </CreateCollectionDialog>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              cover={coverMap[collection.id]}
              onClick={() => setSelectedId(collection.id)}
            />
          ))}
        </div>
      )}

      <CollectionDetailSheet
        collectionId={selectedId}
        onClose={() => setSelectedId(null)}
        onRequestDelete={(c) => setDeleteTarget(c)}
        onItemRemoved={refetch}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete collection?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" and its saved items association will be removed permanently. The items themselves stay in the library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateCollectionDialog({
  children,
  onCreate,
}: {
  children?: React.ReactNode;
  onCreate?: () => void;
}) {
  const { createCollection } = useCollections();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    await createCollection(name.trim(), description.trim() || undefined, isPublic);
    setBusy(false);
    setOpen(false);
    setName('');
    setDescription('');
    onCreate?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button className="h-10 rounded-xl gap-1.5 font-semibold">
            <Plus className="h-4 w-4" />
            New collection
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New collection</DialogTitle>
          <DialogDescription>Create a collection to organize library content.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="coll-name">Name</Label>
            <Input
              id="coll-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Study notes, Fiction, Podcasts"
              maxLength={60}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coll-desc">Description (optional)</Label>
            <Textarea
              id="coll-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={300}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="coll-public">Public collection</Label>
            <Switch id="coll-public" checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CollectionDetailSheet({
  collectionId,
  onClose,
  onRequestDelete,
  onItemRemoved,
}: {
  collectionId: string | null;
  onClose: () => void;
  onRequestDelete: (collection: Collection) => void;
  onItemRemoved?: () => void;
}) {
  const { collection, items, loading, refetch } = useCollectionItems(collectionId);
  const { removeFromCollection } = useCollections();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    setConfirmId(null);
    setShowPicker(false);
  }, [collectionId]);

  const handleRemove = async (itemId: string) => {
    if (!collectionId) return;
    setRemovingId(itemId);
    const ok = await removeFromCollection(collectionId, itemId);
    setRemovingId(null);
    setConfirmId(null);
    if (ok) {
      refetch();
      onItemRemoved?.();
    }
  };

  return (
    <Sheet open={!!collectionId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto rounded-l-2xl border-l border-border/60">
        <SheetHeader>
          {collection && (
            <SheetTitle className="text-left">
              {collection.name}
              <p className="mt-1 text-sm font-normal text-muted-foreground">
                {collection.item_count} {collection.item_count === 1 ? 'item' : 'items'}
                {collection.description ? ` · ${collection.description}` : ''}
              </p>
            </SheetTitle>
          )}
        </SheetHeader>

        <div className="mt-6 pb-8">
          {collection && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPicker((v) => !v)}
                  className="gap-1.5 border-primary/40 font-semibold text-primary hover:bg-primary/10 hover:text-primary"
                >
                  <Plus className="h-4 w-4" />
                  {showPicker ? 'Done adding' : 'Add items'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRequestDelete(collection)}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete collection
                </Button>
              </div>

              {showPicker && (
                <AddItemsPanel
                  collectionId={collection.id}
                  existingIds={new Set(items.map((i) => i.id))}
                  onAdded={() => {
                    refetch();
                    onItemRemoved?.();
                  }}
                />
              )}
            </>
          )}

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 w-full rounded-2xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/80 bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground">
              This collection is empty. Add items with the button above, upload new media, or open any audio, PDF, image or video and choose &ldquo;Add to collection&rdquo;.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {items.map((item) => {
                const content = libraryItemToContent(item);
                const isConfirming = confirmId === item.id;
                return (
                  <div key={item.id} className="relative">
                    <ContentCard content={content} variant="list" />
                    {isConfirming ? (
                      <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-2xl bg-background/80 backdrop-blur-sm">
                        <span className="text-sm font-semibold text-muted-foreground">Remove from collection?</span>
                        <Button size="sm" onClick={() => handleRemove(item.id)} disabled={removingId === item.id} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                          Remove
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmId(item.id)}
                        className="absolute right-2 top-2 z-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AddItemsPanel({
  collectionId,
  existingIds,
  onAdded,
}: {
  collectionId: string;
  existingIds: Set<string>;
  onAdded: () => void;
}) {
  const { user } = useAuth();
  const { items: uploads, refetch: refetchUploads } = useLibraryItems(user?.id);
  const { addToCollection } = useCollections();
  const [busyId, setBusyId] = useState<string | null>(null);

  const available = uploads.filter((u) => !existingIds.has(u.id));

  const handleAdd = async (itemId: string) => {
    setBusyId(itemId);
    const ok = await addToCollection(collectionId, itemId);
    setBusyId(null);
    if (ok) onAdded();
  };

  return (
    <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <p className="mb-3 text-sm font-semibold">Add to this collection</p>

      <div className="flex flex-col gap-2.5">
        {available.map((item) => {
          const Icon = TYPE_ICON[item.type];
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-2.5"
            >
              {item.thumbnail_url ? (
                <img
                  src={item.thumbnail_url}
                  alt=""
                  className="h-10 w-10 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.title}</p>
                <p className="text-xs text-muted-foreground">{kindLabel(item.type)}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === item.id}
                onClick={() => handleAdd(item.id)}
                className="gap-1 rounded-xl border-primary/40 font-semibold text-primary hover:bg-primary/10 hover:text-primary"
              >
                {busyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add
              </Button>
            </div>
          );
        })}

        {available.length === 0 && uploads.length > 0 && (
          <p className="py-2 text-center text-sm text-muted-foreground">
            All your uploads are already in this collection.
          </p>
        )}

        {uploads.length === 0 && (
          <p className="py-2 text-center text-sm text-muted-foreground">
            You haven&rsquo;t uploaded anything yet. Upload audio, PDFs, images or videos and add them here.
          </p>
        )}
      </div>

      <div className="mt-3">
        <UploadItemModal onSuccess={refetchUploads}>
          <Button size="sm" variant="outline" className="gap-1.5 border-border/60 rounded-xl font-semibold">
            <Upload className="h-4 w-4" />
            Upload new and add
          </Button>
        </UploadItemModal>
      </div>
    </div>
  );
}