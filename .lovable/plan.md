
# Social Network Platform Development Plan

This plan addresses all 11 requirements in priority order. Each section includes technical details for implementation.

---

## Phase 1: Profile Page Updates (Requirements 1-3, 6)

### 1.1 Remove Posts & Reels Indicators
**Current State**: Profile page displays post and reel counts in the stats row (lines 511-523 of Profile.tsx)

**Changes Required**:
- Remove the `postCount` and `reelCount` state variables and their fetch logic
- Remove the posts/reels display from the stats row in the UI
- Keep only followers/following counts visible

**Files to Modify**:
- `src/pages/Profile.tsx`

---

### 1.2 Add "My Library" Section
**Current State**: No library section exists on profiles. The `user_library` table already tracks books users have added.

**Changes Required**:
- Create new component `src/components/library/ProfileLibrarySection.tsx`
- Query `user_library` joined with `books` and `reading_progress` tables
- Display book covers in a grid with reading progress indicators
- Add to Profile.tsx below the Activity section

**Database**: Uses existing tables - no schema changes needed

**New Component Structure**:
```
ProfileLibrarySection
├── Loading skeleton
├── Empty state ("No books in library yet")
└── Book grid (cover, title, progress bar)
```

---

### 1.3 Background Cover Upload Feature
**Current State**: Cover display exists but upload is only available via Settings page

**Changes Required**:
- Add camera/edit button overlay on the cover image (visible on own profile)
- Create `CoverUploadDialog` component with:
  - Image upload with drag-and-drop
  - Crop/resize functionality using a library like `react-image-crop`
  - Preview before saving
  - Save/Cancel buttons
- Upload to Supabase Storage `covers` bucket
- Update `profiles.cover_url` on save

**Files to Create/Modify**:
- Create `src/components/profile/CoverUploadDialog.tsx`
- Modify `src/pages/Profile.tsx` to add upload trigger

---

### 1.4 Add "Interests" Tab Next to Activity
**Current State**: Profile only shows "Activity" section with user's posts

**Changes Required**:
- Create database table `interest_posts` for interest-based content
- Add tabs component: "Activity" | "Interests"
- Create `InterestsFeed` component showing user's interest posts
- Different permissions for premium vs regular users (see Phase 2)

**Database Migration Required**:
```sql
CREATE TABLE interest_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(user_id),
  content TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  interest_category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  star_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  bookmark_count INTEGER DEFAULT 0
);
```

---

## Phase 2: Interests System & Premium Permissions (Requirements 4-5)

### 2.1 Registration Interest Selection
**Changes Required**:
- Create `interest_categories` table with predefined categories
- Create `user_interests` table to store user selections
- Add new registration step after account creation
- Create `InterestSelectionStep` component with:
  - Grid of interest categories with icons
  - Multi-select functionality (minimum 3 required)
  - Skip option (can select later)

**Database Migration**:
```sql
CREATE TABLE interest_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(user_id),
  category_id UUID NOT NULL REFERENCES interest_categories(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category_id)
);

-- Seed default categories
INSERT INTO interest_categories (name, icon, color) VALUES
  ('Technology', 'laptop', '#3B82F6'),
  ('Art & Design', 'palette', '#EC4899'),
  ('Music', 'music', '#8B5CF6'),
  ('Sports', 'trophy', '#22C55E'),
  ('Gaming', 'gamepad-2', '#F59E0B'),
  ('Travel', 'plane', '#06B6D4'),
  ('Food', 'utensils', '#EF4444'),
  ('Fashion', 'shirt', '#A855F7'),
  ('Books', 'book-open', '#6366F1'),
  ('Movies & TV', 'clapperboard', '#F97316'),
  ('Fitness', 'dumbbell', '#14B8A6'),
  ('Photography', 'camera', '#84CC16'),
  ('Business', 'briefcase', '#64748B'),
  ('Science', 'flask-conical', '#0EA5E9'),
  ('Nature', 'leaf', '#22C55E');
```

**Auth Flow Update**:
- After successful signup, redirect to `/onboarding/interests`
- Store selection, then redirect to home feed

---

### 2.2 Premium vs Regular User Permissions
**Current State**: Premium status is checked via `has_premium_access` RPC

**Permission Matrix**:
| Action | Premium | Regular |
|--------|---------|---------|
| View Interests content | Yes | Yes |
| Share/Bookmark | Yes | Yes |
| Upload to Interests | Yes | No |
| Comment on Interests | Yes | No |

**Implementation**:
- Create `useInterestPermissions` hook that combines premium status with action checks
- Add permission checks in Interest-related components
- Show upgrade prompts for restricted actions

---

## Phase 3: Navigation Redesign (Requirement 7)

### 3.1 Unique Navigation Bar Design
**Current State**: Standard Instagram-style sidebar navigation

**Proposed Design Approach**:
- **Desktop**: Floating glassmorphism sidebar with animated icons
- **Mobile**: Custom bottom bar with center action button and gesture support
- **Unique Elements**:
  - Animated logo with hover effects
  - Gradient accent on active items
  - Collapsible sidebar option
  - Quick actions panel

**Files to Modify**:
- `src/components/layout/MainLayout.tsx` (complete redesign)
- `src/index.css` (new animation styles)

**Technical Approach**:
- Use Framer Motion for smooth animations
- Implement custom tooltip overlays
- Add micro-interactions on hover/click

---

## Phase 4: Story Upload System Overhaul (Requirement 8)

### 4.1 Redesign Story Creation
**Current State**: Basic file picker with direct upload

**New Features**:
- Multi-step creation wizard
- Camera capture support (webcam/mobile camera)
- Text overlay editor with fonts and colors
- Sticker/emoji overlay support
- Filter effects (brightness, contrast, saturation)
- Music/audio overlay option
- Preview before posting
- Draft saving

**Components to Create**:
```
src/components/stories/
├── StoryCreator.tsx (main wizard)
├── StoryCamera.tsx (capture mode)
├── StoryEditor.tsx (editing tools)
├── StoryPreview.tsx (final preview)
├── overlays/
│   ├── TextOverlay.tsx
│   ├── StickerPicker.tsx
│   └── FilterSelector.tsx
```

---

## Phase 5: International Phone Registration (Requirement 9)

### 5.1 Country Code Selector
**Current State**: Manual phone entry with basic E.164 validation

**Changes Required**:
- Add comprehensive country code selector component
- Include all international dialing codes with flags
- Auto-detect user's country from IP
- Format phone numbers based on selected country
- Validate formats per country

**Implementation**:
- Create `CountryCodeSelector` component with searchable dropdown
- Use `libphonenumber-js` for validation and formatting
- Store country data locally (no API dependency)

**Files to Create/Modify**:
- Create `src/components/auth/CountryCodeSelector.tsx`
- Create `src/lib/countryCodes.ts` (all country data)
- Modify `src/pages/Auth.tsx` phone flow

---

## Phase 6: Multi-Language Support (Requirement 10)

### 6.1 i18n Implementation
**Current State**: Language preference exists but no translation system

**Implementation Plan**:
1. Install `react-i18next` and `i18next`
2. Create translation files structure:
   ```
   src/locales/
   ├── en/
   │   ├── common.json
   │   ├── auth.json
   │   ├── profile.json
   │   └── settings.json
   ├── es/
   ├── fr/
   └── ... (18 languages)
   ```
3. Create `I18nProvider` wrapper
4. Replace all hardcoded strings with `t()` function calls
5. Connect to user preferences for persistence

**Priority Translation Files**:
- Navigation labels
- Auth page content
- Settings page
- Common buttons and messages
- Error messages

---

## Phase 7: Messaging & Calling Testing (Requirement 11)

### 7.1 Testing Strategy
**Areas to Test**:
- Message sending/receiving
- Real-time updates
- Media sharing (images, GIFs)
- Message reactions
- Voice calling (WebRTC)
- Video calling (WebRTC)
- Call history
- Typing indicators

**Testing Approach**:
1. Create Playwright E2E tests for messaging flows
2. Test WebRTC functionality manually across browsers
3. Check for edge cases:
   - Network interruptions
   - Multiple tabs/devices
   - Private account restrictions
   - Blocked users

**Files to Create**:
- `src/test/messaging.test.ts`
- `src/test/calling.test.ts`

---

## Implementation Order (Recommended)

1. **Week 1**: Profile updates (1.1-1.3) - Quick wins
2. **Week 2**: Interest system database + registration flow (2.1)
3. **Week 3**: Interest permissions + profile tab (1.4, 2.2)
4. **Week 4**: Navigation redesign (3.1)
5. **Week 5**: Story upload overhaul (4.1)
6. **Week 6**: International phone support (5.1)
7. **Week 7-8**: Multi-language support (6.1)
8. **Week 9**: Testing & bug fixes (7.1)

---

## Database Migrations Summary

Three migrations will be needed:
1. `interest_categories` and `user_interests` tables
2. `interest_posts` table with RLS policies
3. Updates to ensure proper indexes for performance

---

## Dependencies to Add

```json
{
  "react-i18next": "^14.0.0",
  "i18next": "^23.0.0",
  "libphonenumber-js": "^1.10.0",
  "react-image-crop": "^11.0.0",
  "framer-motion": "^11.0.0"
}
```

---

## Notes

- The interest-based recommendation algorithm will use the `user_interests` table to filter and rank content in the feed
- Premium permission checks should be centralized in a hook for consistency
- Multi-language support is a significant undertaking - consider starting with top 5-6 languages
- WebRTC testing requires real devices/browsers for accurate results
