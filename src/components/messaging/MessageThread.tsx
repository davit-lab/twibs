import { useState, useEffect, useRef, useCallback } from 'react';
import { useMessages, Message } from '@/hooks/useMessages';
import { useMessageReads } from '@/hooks/useMessageReads';
import { useMessageReactions } from '@/hooks/useMessageReactions';
import { useCallBlocks } from '@/hooks/useCallBlocks';
import { useAuth } from '@/contexts/AuthContext';
import { useWebRTC, CallSession } from '@/hooks/useWebRTC';
import { useConversations, Conversation } from '@/hooks/useConversations';
import { getWallpaperBackground } from '@/lib/chatWallpapers';
import WallpaperPickerDialog from './WallpaperPickerDialog';
import { formatLastSeen, isUserOnline } from '@/hooks/usePresence';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AttachmentBubble, { formatDuration, downloadUrl } from './AttachmentBubble';
import { useLiveLocation } from '@/hooks/useLiveLocation';
import LocationShareDialog from './LocationShareDialog';
import { LiveLocationMap, LocationPreview } from './LiveLocationMap';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Send, 
  Loader2, 
  ArrowLeft, 
  Check, 
  Maximize2, 
  Minimize2,
  Phone,
  Video,
  MoreVertical,
  Smile,
  PhoneOff,
  User,
  Users,
  Bell,
  BellOff,
  LogOut,
  Shield,
  Palette,
  ImagePlus,
  Paperclip,
  Mic,
  Square,
  Clapperboard,
  X,
  Download,
  Plus,
  Reply,
  SmilePlus,
  Pencil,
  Trash2,
  MapPin,
  Search,
  Pin,
  PinOff,
  Forward,
  CalendarClock,
  ArrowDown,
  Clock3,
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import CallOverlay from './CallOverlay';
import EmojiPicker from './EmojiPicker';
import GifPicker from './GifPicker';
import MessageReactionPicker from './MessageReactionPicker';
import MessageReactions from './MessageReactions';
import MessageEffects from './MessageEffects';
import MessageReadReceipts from './MessageReadReceipts';
import MessageSearchPanel from './MessageSearchPanel';
import ForwardMessageDialog from './ForwardMessageDialog';
import ScheduleMessageDialog from './ScheduleMessageDialog';
import ScheduledMessagesDialog from './ScheduledMessagesDialog';

interface MessageThreadProps {
  conversationId: string;
  conversation?: Conversation;
  otherUser?: {
    display_name: string;
    username: string;
    avatar_url: string | null;
    is_verified: boolean;
  } | null;
  otherUserId?: string | null;
  onBack?: () => void;
  lastReadAt?: string | null;
  pendingAnswerCall?: CallSession | null;
  onCallAnswered?: () => void;
  initialDraft?: string;
  draftNonce?: string;
}

interface PendingAttachment {
  id: string;
  type: 'image' | 'audio' | 'file';
  url: string;
  name: string;
  size: number;
  mime_type: string | null;
  duration?: number | null;
}

export default function MessageThread({
  conversationId,
  conversation,
  otherUser,
  otherUserId,
  onBack,
  lastReadAt,
  pendingAnswerCall,
  onCallAnswered,
  initialDraft,
  draftNonce,
}: MessageThreadProps) {
  const { user } = useAuth();
  const { messages, loading, loadingMore, hasMore, loadOlder, typingUsers, sendMessage, handleTyping, markAsRead, editMessage, deleteMessage, togglePin, searchMessages } = useMessages(conversationId);
  const { readsByMessage, fetchReadsForMessage } = useMessageReads(conversationId);
  const { toggleReaction, getReactionsForMessage } = useMessageReactions(conversationId);
  const liveLocation = useLiveLocation(conversationId);
  const { blockUser, unblockUser, isUserBlocked } = useCallBlocks();
  const { toggleMute, leaveConversation, deleteConversation } = useConversations();
  const { callState, startCall, answerCall, endCall, toggleAudio, toggleVideo, toggleScreenShare, retryCall } = useWebRTC(conversationId, otherUserId);

  const wallpaper = conversation?.chat_wallpaper || null;
  const wallpaperBackground = getWallpaperBackground(wallpaper);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);

  const isGroup = conversation ? conversation.type !== 'dm' : false;
  const isCommunity = conversation?.type === 'community';
  const displayName = isGroup ? (conversation?.name || 'Group') : (otherUser?.display_name || 'Unknown');
  const avatarUrl = isGroup ? (conversation?.avatar_url || undefined) : (otherUser?.avatar_url || undefined);
  const otherParticipant = conversation?.participants.find((p) => p.user_id === otherUserId);
  const otherProfile = isGroup
    ? null
    : (otherParticipant?.profiles || { last_seen_at: null } as { last_seen_at: string | null });
  const presenceStatus = isGroup
    ? null
    : (otherProfile?.last_seen_at ? formatLastSeen(otherProfile.last_seen_at) : 'Last seen recently');
  const isOnline = isGroup ? false : isUserOnline(otherProfile?.last_seen_at);
  
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isExtended, setIsExtended] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [reactionPickerPosition, setReactionPickerPosition] = useState<'left' | 'right'>('left');
  const [canCall, setCanCall] = useState(true);
  const [callBlockReason, setCallBlockReason] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [muted, setMuted] = useState(conversation?.muted || false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editMessageContent, setEditMessageContent] = useState('');
  const [isSavingEditMessage, setIsSavingEditMessage] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [mapDialogOpen, setMapDialogOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledListOpen, setScheduledListOpen] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMessagesSinceScroll, setNewMessagesSinceScroll] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggeredRef = useRef(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();

  const handleStartCall = async (type: 'audio' | 'video') => {
    if (callState.session || callState.isConnecting) return;

    const result = await startCall(type);
    if (!result.ok) {
      toast({
        variant: 'destructive',
        title: 'Call failed',
        description: result.error || 'Could not start the call.',
      });
    }
  };

  useEffect(() => {
    setMuted(conversation?.muted || false);
  }, [conversation?.muted]);

  useEffect(() => {
    setReplyToMessage(null);
    setAttachments([]);
    setNewMessage('');
    setEditingMessageId(null);
    setSearchOpen(false);
    setForwardTarget(null);
    setNewMessagesSinceScroll(false);
    setIsNearBottom(true);
  }, [conversationId]);

  useEffect(() => {
    if (initialDraft && draftNonce) {
      setNewMessage(initialDraft);
      inputRef.current?.focus();
    }
  }, [initialDraft, draftNonce, conversationId]);

  useEffect(() => {
    const checkCallPermission = async () => {
      if (!user || !otherUserId || isGroup) {
        setCanCall(false);
        setCallBlockReason(isGroup ? 'Not available in groups' : null);
        return;
      }
      const blocked = isUserBlocked(otherUserId);
      setIsBlocked(blocked);

      const { data: otherProfile } = await supabase
        .from('profiles')
        .select('privacy')
        .eq('user_id', otherUserId)
        .single();

      if (otherProfile?.privacy === 'public') {
        setCanCall(true);
        setCallBlockReason(null);
        return;
      }

      const [meFollowingThem, themFollowingMe] = await Promise.all([
        supabase
          .from('follows')
          .select('status')
          .eq('follower_id', user.id)
          .eq('following_id', otherUserId)
          .eq('status', 'accepted')
          .maybeSingle(),
        supabase
          .from('follows')
          .select('status')
          .eq('follower_id', otherUserId)
          .eq('following_id', user.id)
          .eq('status', 'accepted')
          .maybeSingle(),
      ]);

      const isMutualFollow = !!meFollowingThem.data && !!themFollowingMe.data;
      setCanCall(isMutualFollow);
      setCallBlockReason(isMutualFollow ? null : 'Mutual follow required');
    };

    checkCallPermission();
  }, [user, otherUserId, isUserBlocked, isGroup]);

  const handleToggleBlock = async () => {
    if (!otherUserId) return;
    if (isBlocked) {
      await unblockUser(otherUserId);
      setIsBlocked(false);
    } else {
      await blockUser(otherUserId);
      setIsBlocked(true);
    }
  };

  const handleToggleMute = async () => {
    const next = !muted;
    const ok = await toggleMute(conversationId, next);
    if (ok) setMuted(next);
  };

  const handleWallpaperSelect = async (value: string) => {
    const next = value === 'none' ? null : value;
    if (conversation) {
      const { error } = await supabase.rpc('set_conversation_wallpaper', {
        conv_id: conversationId,
        wallpaper: next,
      });
      if (error) console.error('Failed to set shared wallpaper:', error);
    }
    setWallpaperOpen(false);
  };

  const handleLeave = async () => {
    await leaveConversation(conversationId);
    onBack?.();
  };

  const isConversationOwner = !!user && isGroup && conversation?.owner_id === user.id;

  const handleDeleteConversation = async () => {
    setConfirmDeleteOpen(false);
    const ok = await deleteConversation(conversationId);
    if (!ok) {
      toast({
        variant: 'destructive',
        title: 'Could not delete chat',
        description: 'Only the owner can delete this conversation. Please try again.',
      });
      return;
    }
    onBack?.();
  };

  const activeCallType = callState.session?.call_type || null;
  const isInCall = callState.session && callState.session.status !== 'ended' && callState.session.status !== 'declined';

  const isGifUrl = (content: string) => {
    const trimmed = content.trim();
    return (
      trimmed.match(/^https?:\/\/.*\.(gif)(\?.*)?$/i) ||
      trimmed.includes('giphy.com') ||
      trimmed.includes('tenor.com')
    );
  };

  const handleEmojiSelect = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
    inputRef.current?.focus();
  };

  const handleGifSelect = async (gifUrl: string) => {
    setShowGifPicker(false);
    setSending(true);
    try {
      await sendMessage(gifUrl);
    } catch (error) {
      console.error('Failed to send GIF:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to send',
        description: error instanceof Error ? error.message : 'Something went wrong.',
      });
    } finally {
      setSending(false);
    }
  };

  const uploadToChat = async (file: File): Promise<string> => {
    if (!user) throw new Error('Not signed in');
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from('chat-media')
      .upload(path, file, { contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
    return data.publicUrl;
  };

  const addFiles = async (files: File[]) => {
    if (!user) return;
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) {
        toast({ variant: 'destructive', title: 'File too large', description: `${file.name} is over 25MB.` });
        continue;
      }
      setUploadingAttachment(true);
      try {
        const url = await uploadToChat(file);
        setAttachments(prev => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            type: file.type.startsWith('image/') ? 'image' : 'file',
            url,
            name: file.name,
            size: file.size,
            mime_type: file.type,
          },
        ]);
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Upload failed',
          description: err instanceof Error ? err.message : 'Could not upload file.',
        });
      } finally {
        setUploadingAttachment(false);
      }
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) addFiles(files);
    e.target.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) addFiles(files);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  };

  const startRecording = async () => {
    if (!user) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordingChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm' });
        if (blob.size > 0) {
          setUploadingAttachment(true);
          try {
            const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
            const url = await uploadToChat(file);
            setAttachments(prev => [
              ...prev,
              {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                type: 'audio',
                url,
                name: 'Voice message',
                size: blob.size,
                mime_type: 'audio/webm',
                duration: Math.round((Date.now() - recordingStartRef.current) / 1000),
              },
            ]);
          } catch (err) {
            toast({
              variant: 'destructive',
              title: 'Recording failed',
              description: err instanceof Error ? err.message : 'Could not upload recording.',
            });
          } finally {
            setUploadingAttachment(false);
          }
        }
      };
      recorder.start();
      recordingStartRef.current = Date.now();
      setRecordingTime(0);
      setRecording(true);
      recordingTimerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Microphone unavailable',
        description: 'Allow microphone access to record voice messages.',
      });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const threshold = 150;
      setIsNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [conversationId]);

  useEffect(() => {
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    const isOwn = lastMessage.sender_id === user?.id;
    if (isNearBottom || isOwn || lastMessage.optimistic) {
      messagesEndRef.current?.scrollIntoView({ behavior: isOwn ? 'auto' : 'smooth' });
      setNewMessagesSinceScroll(false);
    } else if (lastMessage.sender_id !== user?.id) {
      setNewMessagesSinceScroll(true);
    }
  }, [messages, isNearBottom, user?.id]);

  useEffect(() => {
    if (typingUsers.length > 0 && isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [typingUsers, isNearBottom]);

  useEffect(() => {
    markAsRead();
  }, [conversationId]);

  useEffect(() => {
    if (pendingAnswerCall && pendingAnswerCall.conversation_id === conversationId) {
      const handleAnswer = async () => {
        try {
          await answerCall(pendingAnswerCall);
        } catch (error) {
          console.error('Failed to answer call:', error);
        }
        onCallAnswered?.();
      };
      handleAnswer();
    }
  }, [pendingAnswerCall, conversationId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasText = newMessage.trim().length > 0;
    if ((!hasText && attachments.length === 0) || sending || uploadingAttachment) return;

    setSending(true);
    try {
      await sendMessage(
        newMessage.trim(),
        attachments.map(({ id, ...att }) => att),
        replyToMessage?.id ?? null
      );
      setNewMessage('');
      setAttachments([]);
      setReplyToMessage(null);
      inputRef.current?.focus();
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to send',
        description: error instanceof Error ? error.message : 'Something went wrong.',
      });
    } finally {
      setSending(false);
    }
  };

  const handleReply = (message: Message) => {
    setReplyToMessage(message);
    setSelectedMessageId(null);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    handleTyping();
  };

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return `Yesterday ${format(date, 'HH:mm')}`;
    return format(date, 'MMM d, HH:mm');
  };

  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    
    messages.forEach((message) => {
      const date = new Date(message.created_at);
      let dateLabel: string;
      
      if (isToday(date)) {
        dateLabel = 'Today';
      } else if (isYesterday(date)) {
        dateLabel = 'Yesterday';
      } else {
        dateLabel = format(date, 'MMMM d, yyyy');
      }

      const lastGroup = groups[groups.length - 1];
      if (lastGroup?.date === dateLabel) {
        lastGroup.messages.push(message);
      } else {
        groups.push({ date: dateLabel, messages: [message] });
      }
    });

    return groups;
  };

  const isMessageRead = (message: Message) => {
    if (message.sender_id !== user?.id) return false;
    if (!lastReadAt) return false;
    return new Date(message.created_at) <= new Date(lastReadAt);
  };

  const isMessageSeen = (message: Message) => {
    if (message.sender_id !== user?.id) return false;
    const created = new Date(message.created_at).getTime();
    if (lastReadAt && created <= new Date(lastReadAt).getTime()) return true;
    const otherReads = (conversation?.participants || [])
      .filter((p) => p.user_id !== user?.id)
      .map((p) => p.last_read_at)
      .filter((r): r is string => !!r);
    return otherReads.some((r) => created <= new Date(r).getTime());
  };

  const startEditingMessage = (message: Message) => {
    setEditMessageContent(message.content || '');
    setEditingMessageId(message.id);
    setSelectedMessageId(null);
  };

  const handleSaveMessageEdit = async () => {
    if (!editingMessageId || isSavingEditMessage) return;
    setIsSavingEditMessage(true);
    const ok = await editMessage(editingMessageId, editMessageContent);
    setIsSavingEditMessage(false);
    if (ok) {
      setEditingMessageId(null);
    } else {
      toast({
        variant: 'destructive',
        title: 'Edit failed',
        description: 'This message may have already been seen or you do not have permission.',
      });
    }
  };

  const handleDeleteMessage = async (message: Message) => {
    setSelectedMessageId(null);
    const ok = await deleteMessage(message.id);
    if (!ok) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: 'Could not delete this message.',
      });
    }
  };

  const handleLongPressStart = useCallback((messageId: string, isOwn: boolean) => {
    if (editingMessageId) return;
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setSelectedMessageId(messageId);
      setReactionPickerPosition(isOwn ? 'right' : 'left');
    }, 500);
  }, [editingMessageId]);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleReactionSelect = async (emoji: string) => {
    if (selectedMessageId) {
      await toggleReaction(selectedMessageId, emoji);
      setSelectedMessageId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="h-[70px] px-4 md:px-6 flex items-center gap-3 border-b border-border/50 bg-card/70 backdrop-blur-xl">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="flex-1 p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className={cn('flex gap-2', i % 2 === 0 && 'justify-end')}>
              <Skeleton className="h-12 w-40 rounded-2xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const messageGroups = groupMessagesByDate(messages);
  const messageMap = new Map(messages.map(m => [m.id, m]));

  const replyAuthorName = (m: Message) =>
    m.sender_id === user?.id ? 'You' : (m.profiles?.display_name || 'User');

  const replyContentPreview = (m: Message) => {
    if (m.attachments?.some(a => a.type === 'image')) return '📷 Photo';
    if (m.attachments?.some(a => a.type === 'audio')) return '🎤 Voice message';
    if (m.attachments?.some(a => a.type === 'file')) return '📎 File';
    return m.content || '';
  };

  const pinnedMessages = messages
    .filter(m => m.is_pinned)
    .sort((a, b) => new Date(b.pinned_at || b.created_at).getTime() - new Date(a.pinned_at || a.created_at).getTime());
  const latestPinned = pinnedMessages[0] || null;

  const scrollToMessage = (id: string) => {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleSearchSelect = (message: Message) => {
    setSearchOpen(false);
    setTimeout(() => scrollToMessage(message.id), 120);
  };

  const handleForward = async (conversation: Conversation, message: Message): Promise<boolean> => {
    try {
      await sendMessage(
        message.content,
        (message.attachments || []).map(a => ({
          type: a.type,
          url: a.url,
          name: a.name,
          size: a.size,
          mime_type: a.mime_type,
          duration: a.duration,
        })),
        null,
        { forwardedFromMessageId: message.id }
      );
      return true;
    } catch (error) {
      console.error('Error forwarding message:', error);
      toast({
        variant: 'destructive',
        title: 'Forward failed',
        description: error instanceof Error ? error.message : 'Could not forward this message.',
      });
      return false;
    }
  };

  const openScheduleDialog = () => {
    setScheduleOpen(true);
  };

  const handleScheduled = () => {
    setNewMessage('');
    setAttachments([]);
    setReplyToMessage(null);
  };

  return (
    <>
      {isInCall && activeCallType && (
        <CallOverlay 
          type={activeCallType} 
          user={otherUser || { display_name: displayName, username: otherUser?.username || '', avatar_url: avatarUrl || null }} 
          callState={callState}
          onEnd={endCall}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={toggleScreenShare}
          onRetry={retryCall}
        />
      )}

      <WallpaperPickerDialog
        open={wallpaperOpen}
        onOpenChange={setWallpaperOpen}
        value={wallpaper}
        onSelect={handleWallpaperSelect}
        note="This wallpaper is shared with everyone in this chat — any member can change it."
      />

      <ForwardMessageDialog
        open={!!forwardTarget}
        onOpenChange={(o) => { if (!o) setForwardTarget(null); }}
        message={forwardTarget}
        onForward={handleForward}
      />

      <ScheduleMessageDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        conversationId={conversationId}
        initialContent={newMessage}
        replyToMessageId={replyToMessage?.id ?? null}
        attachments={attachments.map(({ id, ...att }) => att)}
        onScheduled={handleScheduled}
      />

      <ScheduledMessagesDialog
        open={scheduledListOpen}
        onOpenChange={setScheduledListOpen}
        conversationId={conversationId}
      />

      <LocationShareDialog
        open={locationDialogOpen}
        onOpenChange={setLocationDialogOpen}
        sessions={liveLocation.sessions}
        currentUserId={user?.id}
        requesting={liveLocation.requesting}
        error={liveLocation.error}
        signal={liveLocation.signal}
        lastAccuracy={liveLocation.lastAccuracy}
        onStart={liveLocation.startSharing}
        onStop={liveLocation.stopSharing}
      />

      <Dialog open={mapDialogOpen} onOpenChange={setMapDialogOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Live location
            </DialogTitle>
          </DialogHeader>
          <LiveLocationMap
            sessions={liveLocation.sessions}
            currentUserId={user?.id}
            follow
            className="h-[60vh]"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!lightboxUrl} onOpenChange={(open) => { if (!open) setLightboxUrl(null); }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base">Image preview</DialogTitle>
          </DialogHeader>
          {lightboxUrl && (
            <div className="flex flex-col items-center gap-4">
              <img
                src={lightboxUrl}
                alt="Preview"
                className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
              />
              <Button onClick={() => downloadUrl(lightboxUrl, 'image')} className="gap-2">
                <Download className="h-4 w-4" /> Download
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      <div className={cn(
        "flex flex-col h-full bg-background relative",
        isExtended && "fixed inset-0 z-50"
      )}>
        {wallpaperBackground && (
          <>
            <div
              aria-hidden
              className="absolute inset-0"
              style={{ background: wallpaperBackground }}
            />
            <div aria-hidden className="absolute inset-0 bg-white/25 dark:bg-black/40" />
          </>
        )}
        {/* Header */}
        <div className="h-[70px] px-4 md:px-6 flex items-center gap-3 border-b border-border/50 bg-card/70 backdrop-blur-xl flex-shrink-0 z-10">
          {onBack && !isExtended && (
            <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden h-9 w-9 rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}

          <div className="relative">
            <Avatar className="h-10 w-10 rounded-full ring-2 ring-primary/15">
              <AvatarImage src={avatarUrl || undefined} />
              <AvatarFallback className="rounded-full bg-gradient-to-br from-primary to-primary/60 text-white text-sm font-bold">
                {isGroup ? <Users className="h-4 w-4" /> : getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            {!isGroup && (
              <span className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background',
                isOnline ? 'bg-success' : 'bg-muted-foreground/40'
              )} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate flex items-center gap-1.5">
              {displayName}
              {isCommunity && (
                <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                  Community
                </span>
              )}
            </h3>
            <span className={cn(
              'text-xs flex items-center gap-1.5 truncate',
              isGroup ? 'text-muted-foreground' : isOnline ? 'text-success' : 'text-muted-foreground'
            )}>
              {isGroup ? (
                <>{conversation?.participant_count || 0} members</>
              ) : (
                <>
                  {isOnline && <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />}
                  {presenceStatus}
                </>
              )}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              className={cn('icon-btn', searchOpen && 'text-primary')}
              onClick={() => setSearchOpen(!searchOpen)}
              title="Search in chat"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              className={cn('icon-btn', wallpaper && 'text-primary')}
              onClick={() => setWallpaperOpen(true)}
              title="Chat wallpaper"
            >
              <Palette className="h-4 w-4" />
            </button>
            {!isGroup && canCall && (
              <>
                <button className="icon-btn" onClick={() => handleStartCall('audio')}>
                  <Phone className="h-4 w-4" />
                </button>
                <button className="icon-btn" onClick={() => handleStartCall('video')}>
                  <Video className="h-4 w-4" />
                </button>
              </>
            )}
            {!isGroup && !canCall && otherUserId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 opacity-50">
                    <button className="icon-btn" disabled>
                      <Phone className="h-4 w-4" />
                    </button>
                    <button className="icon-btn" disabled>
                      <Video className="h-4 w-4" />
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{callBlockReason}</p>
                </TooltipContent>
              </Tooltip>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="icon-btn">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {isGroup ? (
                  <>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Users className="h-4 w-4 mr-2" />
                        Members ({conversation?.participant_count || 0})
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-64">
                        <div className="p-1">
                          {(conversation?.participants || []).map((participant) => (
                            <div key={participant.user_id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/50">
                              <Avatar className="h-8 w-8 rounded-full">
                                <AvatarImage src={participant.profiles?.avatar_url || undefined} />
                                <AvatarFallback className="rounded-full bg-gradient-to-br from-primary to-primary/60 text-white text-xs font-bold">
                                  {getInitials(participant.profiles?.display_name || 'U')}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {participant.profiles?.display_name || 'User'}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {participant.role === 'owner' ? 'Owner' : participant.role === 'admin' ? 'Admin' : 'Member'}
                                </p>
                              </div>
                              {participant.role === 'owner' && <Shield className="h-3.5 w-3.5 text-primary" />}
                            </div>
                          ))}
                        </div>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuItem onClick={() => setIsExtended(!isExtended)}>
                      {isExtended ? <Minimize2 className="h-4 w-4 mr-2" /> : <Maximize2 className="h-4 w-4 mr-2" />}
                      {isExtended ? 'Exit Fullscreen' : 'Fullscreen'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setScheduledListOpen(true)}>
                      <Clock3 className="h-4 w-4 mr-2" />
                      Scheduled messages
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleToggleMute}>
                      {muted ? <BellOff className="h-4 w-4 mr-2" /> : <Bell className="h-4 w-4 mr-2" />}
                      {muted ? 'Unmute notifications' : 'Mute notifications'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {isConversationOwner && (
                      <>
                        <DropdownMenuItem
                          onClick={() => setConfirmDeleteOpen(true)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete {isCommunity ? 'community' : 'group'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem onClick={handleLeave} className="text-destructive focus:text-destructive">
                      <LogOut className="h-4 w-4 mr-2" />
                      Leave {isCommunity ? 'community' : 'group'}
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem onClick={() => window.open(`/profile/${otherUser?.username}`, '_blank')}>
                      <User className="h-4 w-4 mr-2" />
                      View Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsExtended(!isExtended)}>
                      {isExtended ? <Minimize2 className="h-4 w-4 mr-2" /> : <Maximize2 className="h-4 w-4 mr-2" />}
                      {isExtended ? 'Exit Fullscreen' : 'Fullscreen'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setScheduledListOpen(true)}>
                      <Clock3 className="h-4 w-4 mr-2" />
                      Scheduled messages
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleToggleBlock} className={isBlocked ? "text-success" : "text-destructive"}>
                      {isBlocked ? (
                        <>
                          <Phone className="h-4 w-4 mr-2" />
                          Unblock Calls
                        </>
                      ) : (
                        <>
                          <PhoneOff className="h-4 w-4 mr-2" />
                          Block Calls
                        </>
                      )}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Messages area */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-6 space-y-1 scrollbar-thin relative">
          <MessageSearchPanel
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            onSearch={searchMessages}
            onSelect={handleSearchSelect}
          />

          {hasMore && (
            <div className="flex justify-center my-4">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full text-xs gap-1.5"
                onClick={loadOlder}
                disabled={loadingMore}
              >
                {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDown className="h-3.5 w-3.5 rotate-180" />}
                {loadingMore ? 'Loading…' : 'Load earlier messages'}
              </Button>
            </div>
          )}

          {latestPinned && (
            <div className="sticky top-0 z-20 flex items-center gap-2 rounded-xl border border-primary/30 bg-card/95 backdrop-blur px-3 py-2 mb-3 shadow">
              <Pin className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Pinned message</p>
                <p className="text-xs text-muted-foreground truncate">
                  {replyContentPreview(latestPinned)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => scrollToMessage(latestPinned.id)}
                className="text-[11px] font-semibold text-primary hover:underline flex-shrink-0"
              >
                Jump
              </button>
            </div>
          )}
          {messageGroups.map((group) => (
            <div key={group.date}>
              {/* Date divider */}
              <div className="flex items-center gap-4 my-4">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-xs text-muted-foreground">{group.date}</span>
                <div className="flex-1 h-px bg-border/50" />
              </div>

              <div className="space-y-1">
                {group.messages.map((message, idx) => {
                  const isOwn = message.sender_id === user?.id;
                  const showAvatar = !isOwn && (idx === 0 || group.messages[idx - 1].sender_id !== message.sender_id);
                  const messageReactions = getReactionsForMessage(message.id);
                  const senderProfile = isGroup ? message.profiles : undefined;
                  const replyTarget = message.reply_to_message_id ? messageMap.get(message.reply_to_message_id) : undefined;
                  const isLocationMessage = !!message.location_session_id;
                  const locationSession = message.location_session_id
                    ? (liveLocation.sessions.find((s) => s.id === message.location_session_id) ?? null)
                    : null;

                  return (
                    <div key={message.id} id={`msg-${message.id}`} className={cn('group flex gap-2', isOwn && 'justify-end')}>
                      {!isOwn && (
                        <div className="w-8 flex-shrink-0">
                          {showAvatar && (
                            <Avatar className="h-8 w-8 rounded-full">
                              <AvatarImage src={isGroup ? (senderProfile?.avatar_url || undefined) : (otherUser?.avatar_url || undefined)} />
                              <AvatarFallback className="rounded-full bg-gradient-to-br from-primary to-primary/60 text-white text-xs font-bold">
                                {getInitials(isGroup ? (senderProfile?.display_name || 'U') : displayName)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      )}
                      <div className="relative max-w-[70%]">
                        {!isOwn && showAvatar && isGroup && (
                          <p className="text-xs font-medium text-primary/90 mb-1 ml-1">
                            {senderProfile?.display_name || 'User'}
                          </p>
                        )}
                        {selectedMessageId === message.id && (
                          <MessageReactionPicker
                            onSelect={handleReactionSelect}
                            onClose={() => setSelectedMessageId(null)}
                            position={reactionPickerPosition}
                            onReply={() => handleReply(message)}
                            onEdit={isOwn ? () => startEditingMessage(message) : undefined}
                            onDelete={isOwn ? () => handleDeleteMessage(message) : undefined}
                            onPin={() => togglePin(message.id, message.is_pinned)}
                            pinned={message.is_pinned}
                            onForward={() => setForwardTarget(message)}
                          />
                        )}

                        {/* Hover actions */}
                        <div className={cn(
                          'hidden sm:flex absolute top-1/2 -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100',
                          isOwn ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'
                        )}>
                          <button
                            type="button"
                            onClick={() => handleReply(message)}
                            className="icon-btn h-8 w-8 rounded-full bg-background/90 backdrop-blur border border-border/50 shadow"
                            title="Reply"
                          >
                            <Reply className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSelectedMessageId(message.id); setReactionPickerPosition(isOwn ? 'right' : 'left'); }}
                            className="icon-btn h-8 w-8 rounded-full bg-background/90 backdrop-blur border border-border/50 shadow"
                            title="React"
                          >
                            <SmilePlus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePin(message.id, message.is_pinned)}
                            className={cn(
                              'icon-btn h-8 w-8 rounded-full bg-background/90 backdrop-blur border border-border/50 shadow',
                              message.is_pinned && 'text-primary'
                            )}
                            title={message.is_pinned ? 'Unpin' : 'Pin'}
                          >
                            {message.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setForwardTarget(message)}
                            className="icon-btn h-8 w-8 rounded-full bg-background/90 backdrop-blur border border-border/50 shadow"
                            title="Forward"
                          >
                            <Forward className="h-3.5 w-3.5" />
                          </button>
                          {isOwn && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="icon-btn h-8 w-8 rounded-full bg-background/90 backdrop-blur border border-border/50 shadow"
                                  title="More"
                                >
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align={isOwn ? 'end' : 'start'} className="w-48 rounded-xl">
                                {isMessageSeen(message) ? (
                                  <>
                                    <DropdownMenuItem disabled className="gap-2 text-sm">
                                      <Pencil className="h-4 w-4" />
                                      Edit
                                    </DropdownMenuItem>
                                    <p className="px-2 pb-1 -mt-1 text-[11px] text-muted-foreground">
                                      Seen by the recipient — can't edit
                                    </p>
                                  </>
                                ) : (
                                  <DropdownMenuItem
                                    className="gap-2 text-sm"
                                    onClick={() => startEditingMessage(message)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2 text-sm text-destructive focus:text-destructive"
                                  onClick={() => handleDeleteMessage(message)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                        
                        <div
                          className={cn(
                            'cursor-pointer select-none',
                            isLocationMessage
                              ? 'p-0'
                              : isGifUrl(message.content) || (!message.content && message.attachments?.length)
                                ? 'p-1'
                                : 'px-4 py-2.5',
                            !isLocationMessage && (isOwn ? 'message-own shadow-md shadow-primary/25' : 'message-other'),
                            selectedMessageId === message.id && 'ring-2 ring-primary/50'
                          )}
                          onMouseDown={() => handleLongPressStart(message.id, isOwn)}
                          onMouseUp={handleLongPressEnd}
                          onMouseLeave={handleLongPressEnd}
                          onTouchStart={() => handleLongPressStart(message.id, isOwn)}
                          onTouchEnd={handleLongPressEnd}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setSelectedMessageId(message.id);
                            setReactionPickerPosition(isOwn ? 'right' : 'left');
                          }}
                        >
                          {replyTarget && (
                            <button
                              type="button"
                              onClick={() => document.getElementById(`msg-${replyTarget.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                              className={cn(
                                'flex flex-col gap-0.5 text-left border-l-2 rounded-r-lg px-2.5 py-1.5 mb-1.5 w-full',
                                isOwn ? 'border-white/60 bg-white/15' : 'border-primary/60 bg-primary/5'
                              )}
                            >
                              <span className={cn('text-xs font-semibold', isOwn ? 'text-white' : 'text-primary')}>
                                {replyAuthorName(replyTarget)}
                              </span>
                              <span className={cn('text-xs truncate', isOwn ? 'text-white/80' : 'text-muted-foreground')}>
                                {replyContentPreview(replyTarget)}
                              </span>
                            </button>
                          )}
                          {editingMessageId === message.id ? (
                            <div className={cn('flex flex-col gap-1.5 py-1', isOwn ? 'items-end' : 'items-start')}>
                              <textarea
                                value={editMessageContent}
                                onChange={(e) => setEditMessageContent(e.target.value)}
                                rows={2}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSaveMessageEdit();
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingMessageId(null);
                                  }
                                }}
                                className={cn(
                                  'w-full min-w-[220px] rounded-xl px-3 py-2 text-sm bg-background/80 border border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none',
                                  isOwn ? 'text-right' : 'text-left'
                                )}
                              />
                              <div className="flex items-center gap-1.5">
                                <Button
                                  size="sm"
                                  onClick={handleSaveMessageEdit}
                                  disabled={!editMessageContent.trim() || isSavingEditMessage}
                                  className="h-8 rounded-full gap-1.5 px-4"
                                >
                                  {isSavingEditMessage ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5" />
                                  )}
                                  Save
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingMessageId(null)}
                                  disabled={isSavingEditMessage}
                                  className="h-8 rounded-full text-muted-foreground hover:text-foreground"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {message.forwarded_message && (
                                <div className="mb-1">
                                  <p className={cn('text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1', isOwn ? 'text-white/80' : 'text-primary/90')}>
                                    <Forward className="h-3 w-3" />
                                    Forwarded from {replyAuthorName(message.forwarded_message)}
                                  </p>
                                  {message.forwarded_message.content && !isGifUrl(message.forwarded_message.content) && (
                                    <p className={cn('text-xs truncate mt-0.5 max-w-[220px]', isOwn ? 'text-white/70' : 'text-muted-foreground')}>
                                      {message.forwarded_message.content}
                                    </p>
                                  )}
                                </div>
                              )}
                              {message.effect && (
                                <MessageEffects effect={message.effect} />
                              )}
                              {isLocationMessage ? (
                                <LocationPreview
                                  session={locationSession}
                                  currentUserId={user?.id}
                                  isOwn={isOwn}
                                  onExpand={() => setMapDialogOpen(true)}
                                />
                              ) : isGifUrl(message.content) ? (
                                <img
                                  src={message.content.trim()}
                                  alt="GIF"
                                  className="max-w-full rounded-xl max-h-64 object-contain pointer-events-none"
                                  loading="lazy"
                                />
                              ) : message.content ? (
                                <p className="break-words text-sm leading-relaxed">{message.content}</p>
                              ) : null}
                              {message.attachments && message.attachments.length > 0 && (
                                <AttachmentBubble
                                  attachments={message.attachments}
                                  isOwn={isOwn}
                                  onImageClick={setLightboxUrl}
                                />
                              )}
                            </>
                          )}
                          <div className={cn('flex items-center gap-1 mt-1', isOwn ? 'justify-end' : 'justify-start')}>
                            {message.is_edited && (
                              <span className={cn('text-[10px] font-medium uppercase tracking-wide', isOwn ? 'text-white/60' : 'text-muted-foreground/70')}>
                                edited
                              </span>
                            )}
                            <span className={cn('text-[10px]', isOwn ? 'text-white/70' : 'text-muted-foreground')}>
                              {formatMessageTime(message.created_at)}
                            </span>
                            {isOwn && (
                              <MessageReadReceipts
                                messageId={message.id}
                                isOwn={isOwn}
                                isRead={isMessageRead(message)}
                                readers={readsByMessage[message.id]?.filter(r => r.user_id !== user?.id) || []}
                                totalOthers={Math.max(1, conversation?.participants?.length || 1)}
                                onFetch={fetchReadsForMessage}
                              />
                            )}
                          </div>
                        </div>
                        
                        <MessageReactions
                          reactions={messageReactions}
                          isOwn={isOwn}
                          onToggle={(emoji) => toggleReaction(message.id, emoji)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {typingUsers.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              {!isGroup && (
                <Avatar className="h-8 w-8 rounded-full">
                  <AvatarImage src={otherUser?.avatar_url || undefined} />
                  <AvatarFallback className="rounded-full bg-gradient-to-br from-primary to-primary/60 text-white text-xs font-bold">
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
              )}
              <div>
                {isGroup && (
                  <p className="text-xs font-medium text-primary/90 mb-0.5">
                    {typingUsers.map(u => u.display_name).join(', ')} typing…
                  </p>
                )}
                <div className="typing-bubble">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}

          {liveLocation.activeSessions.length > 0 && (
            <div className="sticky bottom-2 z-10 flex items-center justify-center mt-2">
              <button
                type="button"
                onClick={() => setMapDialogOpen(true)}
                className="flex items-center gap-2 rounded-full bg-background/95 backdrop-blur border border-border/70 shadow-lg px-3.5 py-2 hover:bg-background"
              >
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                <span className="text-xs font-medium truncate">
                  {liveLocation.activeSessions
                    .map((s) => (s.user_id === user?.id ? 'You' : s.profiles?.display_name || 'Someone'))
                    .join(', ')}
                  {' '}
                  {liveLocation.activeSessions.length === 1 ? 'is' : 'are'} sharing live location
                </span>
                <span className="text-[11px] font-semibold text-primary flex-shrink-0">View</span>
              </button>
            </div>
          )}

          {newMessagesSinceScroll && (
            <div className="sticky bottom-2 z-10 flex items-center justify-center">
              <button
                type="button"
                onClick={() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  setNewMessagesSinceScroll(false);
                }}
                className="flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground shadow-lg px-3.5 py-1.5 text-xs font-semibold"
              >
                <ArrowDown className="h-3.5 w-3.5" />
                New messages
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick emoji bar */}
        <div className="flex gap-1 px-6 flex-wrap relative">
          {['👍', '❤️', '😂', '🔥', '✨', '🎨', '💜', '🙌'].map((emoji) => (
            <button key={emoji} className="emoji-chip" onClick={() => handleEmojiSelect(emoji)}>
              {emoji}
            </button>
          ))}
        </div>

        {/* Input area */}
        <div className="px-3 pt-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)] md:p-4 border-t border-border/50 bg-card/70 backdrop-blur-xl flex-shrink-0 relative">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageSelect}
          />
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
          />

          {replyToMessage && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <Reply className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-primary truncate">
                  Replying to {replyAuthorName(replyToMessage)}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {replyContentPreview(replyToMessage)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyToMessage(null)}
                className="icon-btn h-7 w-7 rounded-full flex-shrink-0"
                title="Cancel reply"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {recording && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="text-sm font-medium text-red-500">Recording {formatDuration(recordingTime)}</span>
              <button
                type="button"
                onClick={stopRecording}
                className="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Stop
              </button>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((att) => (
                <div key={att.id} className="relative group">
                  {att.type === 'image' ? (
                    <img
                      src={att.url}
                      alt={att.name}
                      className="h-16 w-16 rounded-lg object-cover border border-border/60"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-lg border border-border/60 flex flex-col items-center justify-center gap-0.5 bg-muted/40 px-1">
                      {att.type === 'audio' ? (
                        <Mic className="h-5 w-5 text-primary" />
                      ) : (
                        <Paperclip className="h-5 w-5 text-primary" />
                      )}
                      <span className="text-[9px] text-muted-foreground truncate max-w-full">{att.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center shadow"
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {uploadingAttachment && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground self-center" />}
            </div>
          )}

          <form onSubmit={handleSend} className="flex items-end gap-1 sm:gap-2">
            <button
              type="button"
              className="icon-btn h-10 w-10 sm:h-11 sm:w-11 rounded-full flex-shrink-0"
              onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); }}
              title="Emoji"
            >
              <Smile className="w-5 h-5" />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="icon-btn h-10 w-10 sm:h-11 sm:w-11 rounded-full flex-shrink-0"
                  title="Attach"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={() => { setShowGifPicker(true); setShowEmojiPicker(false); }}>
                  <Clapperboard className="h-4 w-4 mr-2" />
                  GIF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                  <ImagePlus className="h-4 w-4 mr-2" />
                  Photo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-4 w-4 mr-2" />
                  File
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setLocationDialogOpen(true); setShowEmojiPicker(false); }}>
                  <MapPin className="h-4 w-4 mr-2" />
                  Live location
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setShowEmojiPicker(false); setShowGifPicker(false); openScheduleDialog(); }}>
                  <CalendarClock className="h-4 w-4 mr-2" />
                  Schedule message
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="orbis-input-wrap h-11 flex-1 rounded-2xl min-w-0">
              <input
                ref={inputRef}
                value={newMessage}
                onChange={handleInputChange}
                onPaste={handlePaste}
                placeholder={replyToMessage ? 'Reply…' : recording ? 'Recording…' : 'Type a message...'}
                disabled={sending}
                className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground min-w-0"
              />
            </div>

            {recording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="send-btn flex-shrink-0"
                title="Stop recording"
              >
                <Square className="w-5 h-5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                className="icon-btn h-10 w-10 sm:h-11 sm:w-11 rounded-full flex-shrink-0"
                title="Record voice message"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}

            <button
              type="submit"
              disabled={(!newMessage.trim() && attachments.length === 0) || sending || uploadingAttachment}
              className="send-btn disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </form>

          {showEmojiPicker && (
            <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmojiPicker(false)} />
          )}
          {showGifPicker && (
            <GifPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} />
          )}
        </div>
      </div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {isCommunity ? 'community' : 'group'}?</AlertDialogTitle>
            <AlertDialogDescription>
              "{conversation?.name || 'This chat'}" will be permanently deleted for every member.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
