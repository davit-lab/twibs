import { Fragment } from 'react';
import { Link } from 'react-router-dom';

// Matches #tag or @username tokens (with a non-word boundary guard so
// "abc@user" doesn't match).
const TOKEN_RE = /(^|[^\w#@])(#([A-Za-z0-9_]{1,30})|@([A-Za-z0-9_]{1,30}))/g;

interface RichTextProps {
  text: string;
  className?: string;
}

export default function RichText({ text, className }: RichTextProps) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    const [full, boundary, token, hashtag, mention] = match;
    const start = match.index;

    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    const link =
      hashtag !== undefined ? (
        <Link
          key={key++}
          to={`/explore?q=${encodeURIComponent('#' + hashtag)}`}
          onClick={(e) => e.stopPropagation()}
          className="text-primary font-semibold hover:underline transition-colors"
        >
          {token}
        </Link>
      ) : (
        <Link
          key={key++}
          to={`/profile/${mention}`}
          onClick={(e) => e.stopPropagation()}
          className="text-primary font-semibold hover:underline transition-colors"
        >
          {token}
        </Link>
      );

    nodes.push(
      <Fragment key={key++}>
        {boundary}
        {link}
      </Fragment>
    );

    lastIndex = start + full.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return <span className={className}>{nodes}</span>;
}
