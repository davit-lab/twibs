import { useState, useRef, useEffect } from 'react';
import { Smile, Search, Clock, Heart, HandMetal, Utensils, Plane, Trophy, Lightbulb, Flag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  position?: 'up' | 'down';
}

const EMOJI_CATEGORIES = {
  recent: { icon: Clock, label: 'Recent', emojis: ['😀', '❤️', '👍', '😂', '🎉', '🔥', '💯', '✨'] },
  smileys: {
    icon: Smile,
    label: 'Smileys',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
      '😘', '😗', '☺️', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
      '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷',
      '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐'
    ]
  },
  gestures: {
    icon: HandMetal,
    label: 'Gestures',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆',
      '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️',
      '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅'
    ]
  },
  love: {
    icon: Heart,
    label: 'Love',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
      '💘', '💝', '💟', '♥️', '💋', '💌', '💐', '🌹', '🥀', '🌺', '🌸', '🌷', '🌻', '💍', '💒', '👫'
    ]
  },
  food: {
    icon: Utensils,
    label: 'Food',
    emojis: [
      '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝',
      '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐',
      '🍕', '🍔', '🍟', '🌭', '🍿', '🧂', '🥤', '☕', '🍵', '🧃', '🍺', '🍻', '🥂', '🍷', '🍸', '🍹'
    ]
  },
  travel: {
    icon: Plane,
    label: 'Travel',
    emojis: [
      '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵',
      '🚲', '🛴', '🛹', '🛼', '🚁', '🛩️', '✈️', '🛫', '🛬', '🪂', '💺', '🚀', '🛸', '🚆', '🚇', '🚈',
      '🏠', '🏡', '🏢', '🏣', '🏤', '🏥', '🏦', '🏨', '🏩', '🏪', '🏫', '🏬', '🏭', '🏯', '🏰', '💒'
    ]
  },
  activities: {
    icon: Trophy,
    label: 'Activities',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍',
      '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌',
      '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️', '🤺', '🤾', '🏌️', '🏇', '⛑️', '🎖️', '🏆', '🏅'
    ]
  },
  objects: {
    icon: Lightbulb,
    label: 'Objects',
    emojis: [
      '⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💽', '💾', '💿', '📀', '📼',
      '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭',
      '💡', '🔦', '🏮', '🪔', '📔', '📕', '📖', '📗', '📘', '📙', '📚', '📓', '📒', '📃', '📜', '📄'
    ]
  },
  symbols: {
    icon: Flag,
    label: 'Symbols',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
      '✨', '⭐', '🌟', '💫', '⚡', '🔥', '💥', '☀️', '🌈', '☁️', '❄️', '💧', '🌊', '🎉', '🎊', '🎁',
      '✅', '❌', '❓', '❗', '💯', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '▶️', '⏸️'
    ]
  }
};

export default function EmojiPicker({ onSelect, onClose, position = 'up' }: EmojiPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('smileys');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const filteredEmojis = searchQuery
    ? Object.values(EMOJI_CATEGORIES).flatMap(cat => 
        cat.emojis.filter(emoji => emoji.includes(searchQuery))
      )
    : null;

  return (
    <div 
      ref={containerRef}
      className={cn(
        "absolute right-0 w-80 bg-card border border-border rounded-2xl overflow-hidden z-50 shadow-xl shadow-black/5",
        position === 'up' ? "bottom-full mb-2" : "top-full mt-2"
      )}
    >
      {/* Header */}
      <div className="p-3 border-b border-border/30 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search emojis..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 rounded-xl bg-muted/50 border-0 text-sm"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="rounded-full h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      {filteredEmojis ? (
        <ScrollArea className="h-64 p-3">
          <div className="grid grid-cols-8 gap-1">
            {filteredEmojis.map((emoji, idx) => (
              <button
                key={idx}
                onClick={() => onSelect(emoji)}
                className="p-2 hover:bg-primary/10 rounded-lg text-xl transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
          {filteredEmojis.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No emojis found</p>
          )}
        </ScrollArea>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start gap-0 h-10 bg-transparent border-b border-border/30 rounded-none p-0">
            {Object.entries(EMOJI_CATEGORIES).map(([key, { icon: Icon }]) => (
              <TabsTrigger
                key={key}
                value={key}
                className={cn(
                  "flex-1 rounded-none h-full data-[state=active]:bg-transparent data-[state=active]:shadow-none",
                  "data-[state=active]:border-b-2 data-[state=active]:border-primary"
                )}
              >
                <Icon className="h-4 w-4" />
              </TabsTrigger>
            ))}
          </TabsList>
          
          {Object.entries(EMOJI_CATEGORIES).map(([key, { emojis }]) => (
            <TabsContent key={key} value={key} className="m-0">
              <ScrollArea className="h-56 p-2">
                <div className="grid grid-cols-8 gap-0.5">
                  {emojis.map((emoji, idx) => (
                    <button
                      key={idx}
                      onClick={() => onSelect(emoji)}
                      className="p-1.5 hover:bg-primary/10 rounded-lg text-xl transition-colors hover:scale-110"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
