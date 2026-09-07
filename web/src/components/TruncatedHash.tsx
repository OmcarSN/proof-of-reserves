import { CopyButton } from './CopyButton';

interface TruncatedHashProps {
  hash: string;
  prefixLen?: number;
  suffixLen?: number;
  href?: string | null;
  label?: string;
  className?: string;
}

export function TruncatedHash({
  hash,
  prefixLen = 8,
  suffixLen = 8,
  href,
  label,
  className = '',
}: TruncatedHashProps) {
  const display =
    hash.length > prefixLen + suffixLen + 3
      ? `${hash.slice(0, prefixLen)}…${hash.slice(-suffixLen)}`
      : hash;

  const inner = (
    <code className="hash-text" title={hash}>
      {display}
    </code>
  );

  return (
    <span className={`truncated-hash ${className}`}>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="hash-link">
          {inner}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="external-icon">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      ) : (
        inner
      )}
      <CopyButton text={hash} label={label || 'hash'} />
    </span>
  );
}
