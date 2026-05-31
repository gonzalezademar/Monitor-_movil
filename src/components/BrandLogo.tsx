interface LogoProps {
  className?: string;
  size?: number;
}

export function AgIsotype({ className = '', size = 32 }: LogoProps) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`ag-isotype ${className}`}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <defs>
        <linearGradient id="agBrandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      {/* Sleek interlocking AG Monogram */}
      <path 
        d="M25 75 L50 25 L75 75" 
        stroke="url(#agBrandGrad)" 
        strokeWidth="9" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      <path 
        d="M38 52 H62 C70 52 75 58 75 65 C75 72 68 78 60 78 C50 78 45 70 45 60 C45 50 52 42 62 42 C70 42 75 48 75 52" 
        stroke="url(#agBrandGrad)" 
        strokeWidth="9" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
    </svg>
  );
}

export function AgLogoFull({ className = '', size = 48 }: LogoProps) {
  return (
    <div className={`ag-logo-full-container ${className}`} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <AgIsotype size={size} />
      <div style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Inter', sans-serif", textAlign: 'left' }}>
        <span style={{ fontSize: `${size * 0.45}px`, fontWeight: 800, color: '#f8fafc', letterSpacing: '0.5px', lineHeight: 1.1 }}>
          AG
        </span>
        <span style={{ fontSize: `${size * 0.25}px`, fontWeight: 500, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase', lineHeight: 1 }}>
          Creations
        </span>
      </div>
    </div>
  );
}
