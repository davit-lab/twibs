import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import Messages from './Messages';

const mockUseAuth = vi.fn();
const mockUseConversations = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/hooks/useConversations', () => ({
  useConversations: () => mockUseConversations(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/messaging/ConversationList', () => ({
  default: () => <div>ConversationList</div>,
}));

vi.mock('@/components/messaging/CallHistory', () => ({
  default: () => <div>CallHistory</div>,
}));

vi.mock('@/components/messaging/MessageThread', () => ({
  default: () => <div>MessageThread</div>,
}));

vi.mock('@/components/messaging/NewChatDialog', () => ({
  default: () => null,
}));

describe('Messages layout', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1' },
      loading: false,
    });

    mockUseConversations.mockReturnValue({
      conversations: [],
      loading: false,
      startConversation: vi.fn(),
      createGroup: vi.fn(),
      createCommunity: vi.fn(),
      joinByCode: vi.fn(),
      leaveConversation: vi.fn(),
      deleteConversation: vi.fn(),
    });
  });

  it('uses a tighter sidebar width for more room in the chat list', () => {
    const { container } = render(<Messages />);

    const sidebar = container.querySelector('.flex.relative > div');

    expect(sidebar).not.toBeNull();
    expect(sidebar).toHaveClass('md:w-72');
    expect(sidebar).toHaveClass('lg:w-80');
    expect(screen.getByRole('button', { name: /Chats/i })).toBeInTheDocument();
  });
});
