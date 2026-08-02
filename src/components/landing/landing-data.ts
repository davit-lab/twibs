import {
  BookOpen,
  MessageCircle,
  Shield,
  TrendingUp,
  Users,
  Video,
} from 'lucide-react';

const u = (id: string, w = 600) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

export const IMG = {
  postImage: u('photo-1506905925346-21bda4d32df4', 720),
  postAuthor: u('photo-1524504388940-b1c1722653e1', 96),
  story1: u('photo-1494790108377-be9c29b29330', 120),
  story2: u('photo-1500648767791-00dcc994a43e', 120),
  story3: u('photo-1534528741775-53994a69daeb', 120),
  story4: u('photo-1517841905240-472988babdf9', 120),
};

export const TRUST_AVATARS = [IMG.story1, IMG.story2, IMG.story3, IMG.story4];

export const STORY_NAMES = ['You', 'Nino', 'Luka', 'Ana'];

export const FEATURED = [
  { img: u('photo-1494790108377-be9c29b29330', 500), name: 'Nino', role: 'Author' },
  { img: u('photo-1500648767791-00dcc994a43e', 500), name: 'Luka', role: 'Creator' },
  { img: u('photo-1534528741775-53994a69daeb', 500), name: 'Ana', role: 'Photographer' },
];

export const FEATURES = [
  { icon: Video, title: 'Stories & Reels', desc: 'Share disappearing stories and short videos that reach your followers instantly.' },
  { icon: MessageCircle, title: 'Messaging & Calls', desc: 'Real-time chat with crystal-clear voice and video calls built in.' },
  { icon: BookOpen, title: 'Digital Library', desc: 'Publish books, share PDFs and build your own personal collection.' },
  { icon: TrendingUp, title: 'Creator earnings', desc: 'Subscriptions, tips and book sales tracked in one dashboard.' },
  { icon: Users, title: 'Communities', desc: 'Create and grow groups around anything you love.' },
  { icon: Shield, title: 'Privacy controls', desc: 'Decide exactly who sees your posts, stories and profile.' },
];

export const STEPS = [
  { title: 'Create your account', desc: 'Sign up in under a minute with email or phone. Free forever.' },
  { title: 'Share your story', desc: 'Post updates, stories and reels the moment they happen.' },
  { title: 'Grow your audience', desc: 'Build a community, earn from your content and go live.' },
];

export const STATS = [
  { value: '50K+', label: 'Creators' },
  { value: '2M+', label: 'Stories shared' },
  { value: '120+', label: 'Countries' },
  { value: '4.9/5', label: 'Creator rating' },
];

export const HIGHLIGHTS = [
  'Real-time notifications and live presence',
  'Monetization with zero hidden fees',
  'Works across every device',
  'Loved by creators worldwide',
];

export const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how' },
  { label: 'Library', href: '/library' },
  { label: 'Pricing', href: '/pricing' },
];

export const FOOTER_COLUMNS = [
  { title: 'Product', links: ['Stories', 'Reels', 'Messaging', 'Calls', 'Library'] },
  { title: 'Company', links: ['About', 'Careers', 'Press', 'Blog'] },
  { title: 'Resources', links: ['Help Center', 'Creator Guide', 'Community', 'Status'] },
  { title: 'Legal', links: ['Privacy Policy', 'Terms of Service', 'Cookies', 'Safety'] },
];
