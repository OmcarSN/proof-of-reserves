interface SolventStampProps {
  solvent: boolean;
  size?: 'sm' | 'lg';
  className?: string;
}

export function SolventStamp({ solvent, size = 'lg', className = '' }: SolventStampProps) {
  return (
    <div
      className={`solvent-stamp solvent-stamp--${solvent ? 'solvent' : 'insolvent'} solvent-stamp--${size} ${className}`}
      role="status"
      aria-label={solvent ? 'Verdict: Solvent' : 'Verdict: Not Solvent'}
    >
      <span className="solvent-stamp-border">
        <span className="solvent-stamp-text">
          {solvent ? 'SOLVENT' : 'NOT SOLVENT'}
        </span>
      </span>
    </div>
  );
}
