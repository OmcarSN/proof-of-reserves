import { ShieldCheckIcon } from './Icons';

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
      <div className="solvent-stamp-inner">
        <div className="solvent-stamp-icon-wrap">
          <ShieldCheckIcon size={size === 'lg' ? 20 : 15} />
        </div>
        <div className="solvent-stamp-content">
          <span className="solvent-stamp-text">
            {solvent ? 'SOLVENT' : 'DEFICIT'}
          </span>
          <span className="solvent-stamp-sub">
            {solvent ? '100% ZK-VERIFIED' : 'ACTION REQUIRED'}
          </span>
        </div>
      </div>
    </div>
  );
}
