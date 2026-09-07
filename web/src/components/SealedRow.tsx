interface SealedRowProps {
  index: number;
  className?: string;
}

export function SealedRow({ index, className = '' }: SealedRowProps) {
  return (
    <div className={`sealed-row ${className}`} aria-label={`Customer ${index + 1} — balance sealed`}>
      <span className="sealed-row-index">#{index + 1}</span>
      <span className="sealed-row-bar" aria-hidden="true">
        <span className="sealed-row-redacted" />
      </span>
      <span className="sealed-row-lock" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </span>
    </div>
  );
}
