const u = (id: string, w = 800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const usq = (id: string, w = 200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&h=${w}&q=80`;

export const IMG = {
  heroMain: u('photo-1529156069898-49953e39b3ac', 900),
  heroTall: u('photo-1517841905240-472988babdf9', 700),
  heroWide: u('photo-1522202176988-66273c2fd55f', 900),
  heroSmall: u('photo-1500530855697-b586d89ba3ee', 500),
  avatarAuthor: usq('photo-1534528741775-53994a69daeb', 160),
  avatarFriend: usq('photo-1494790108377-be9c29b29330', 160),
  avatarPerson: usq('photo-1500648767791-00dcc994a43e', 160),
};

/** Fallback editorial moments shown when no public content can be read safely. */
export const FALLBACK_MOMENTS = [
  {
    id: 'm1',
    image: u('photo-1500530855697-b586d89ba3ee', 700),
    caption: 'Golden hour on the trail',
    authorName: 'Nino',
    authorAvatar: usq('photo-1534528741775-53994a69daeb', 96),
  },
  {
    id: 'm2',
    image: u('photo-1511632765486-a01980e01a18', 700),
    caption: 'Last night was the one',
    authorName: 'Luka',
    authorAvatar: usq('photo-1500648767791-00dcc994a43e', 96),
  },
  {
    id: 'm3',
    image: u('photo-1524995997946-a1c2e315a42f', 700),
    caption: 'This week, on the shelf',
    authorName: 'Ana',
    authorAvatar: usq('photo-1494790108377-be9c29b29330', 96),
  },
  {
    id: 'm4',
    image: u('photo-1546069901-ba9599a7e63c', 700),
    caption: 'Small feast, big mood',
    authorName: 'Mariam',
    authorAvatar: usq('photo-1524504388940-b1c1722653e1', 96),
  },
];

export const STORIES = [
  {
    img: u('photo-1511632765486-a01980e01a18', 700),
    thumb: usq('photo-1534528741775-53994a69daeb', 144),
    name: 'Nino',
    caption: 'Night out with the crew',
  },
  {
    img: u('photo-1543269865-cbf427effbad', 700),
    thumb: usq('photo-1494790108377-be9c29b29330', 144),
    name: 'Ana',
    caption: 'Laughing through Monday',
  },
  {
    img: u('photo-1506905925346-21bda4d32df4', 700),
    thumb: usq('photo-1500648767791-00dcc994a43e', 144),
    name: 'Luka',
    caption: 'Summit at sunrise',
  },
];

export const REELS = [
  {
    img: u('photo-1514525253161-7a46d19cd819', 700),
    // The previous Unsplash asset now responds with a non-image payload in
    // Chromium, which is blocked by ORB in production.
    thumb: IMG.avatarPerson,
    handle: '@nino',
    caption: 'Stage lights hit different',
  },
  {
    img: u('photo-1470229722913-7c0e2dbbafd3', 700),
    thumb: usq('photo-1507003211169-0a1dd7228f2d', 144),
    handle: '@mariam',
    caption: 'Last night at the arena',
  },
  {
    img: u('photo-1510915228340-29c85a43dcfe', 700),
    thumb: usq('photo-1524504388940-b1c1722653e1', 144),
    handle: '@ana',
    caption: 'Never gets old',
  },
];

export const MESSAGING_PHOTOS = [
  { img: u('photo-1508214751196-bcfd4ca60f91', 600), label: 'Catch up' },
  { img: u('photo-1522252234503-e356532cafd5', 600), label: 'Daily calls' },
];

export const INTERESTS = [
  { label: 'Music', sub: 'Tracks, gigs, playlists', img: u('photo-1470229722913-7c0e2dbbafd3', 700) },
  { label: 'Books', sub: 'Pages & reading lists', img: u('photo-1524995997946-a1c2e315a42f', 700) },
  { label: 'Travel', sub: 'Maps you can walk through', img: u('photo-1469474968028-56623f02e42e', 700) },
  { label: 'Fashion', sub: 'Looks & lookbooks', img: u('photo-1515886657613-9f3515b0c78f', 700) },
  { label: 'Food', sub: 'Tables worth sharing', img: u('photo-1546069901-ba9599a7e63c', 700) },
  { label: 'Outdoors', sub: 'Trails, peaks, quiet', img: u('photo-1506905925346-21bda4d32df4', 700) },
];

export const COMMUNITIES = [
  {
    name: 'Sunday Reading Circle',
    tagline: 'For people who always have a book with them',
    img: u('photo-1481627834876-b7833e8f5570', 700),
  },
  {
    name: 'Analog Photo Club',
    tagline: 'Frames, grain and half-pressed shutters',
    img: u('photo-1516035069371-29a1b244cc32', 700),
  },
  {
    name: 'Midnight Runners',
    tagline: 'The city is quietest after eleven',
    img: u('photo-1538805060514-97d9cc17730c', 700),
  },
];

export const LIBRARY_COVERS = [
  u('photo-1543002588-bfa74002ed7e', 500),
  u('photo-1544716278-ca5e3f4abd8c', 500),
  u('photo-1524995997946-a1c2e315a42f', 500),
];

export const VISUAL_BREAK_IMAGE = u('photo-1519608487953-e999c86e7455', 1600);

export const NAV_LINKS = [
  { label: 'What is Twibsers', href: '#what' },
  { label: 'Stories', href: '#stories' },
  { label: 'Reels', href: '#reels' },
  { label: 'Messaging', href: '#messaging' },
  { label: 'Library', href: '/library' },
];
