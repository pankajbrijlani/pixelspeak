// Small dependency-free inline icon set for the montage UI.
export function UploadCloudIcon({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.5}>
      <path d="M7 18a4.5 4.5 0 0 1-.5-8.98 5.5 5.5 0 0 1 10.74-1.7A4.5 4.5 0 0 1 17 18H7Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 11v7m0-7 2.5 2.5M12 11 9.5 13.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FilmIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.6}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" strokeLinecap="round" />
    </svg>
  );
}

export function ImageIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.6}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 16-5.5-5.5a1.5 1.5 0 0 0-2.12 0L4 19" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckCircleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.6}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ErrorCircleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.6}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
    </svg>
  );
}

export function SpinnerIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2.5} />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}

export function DownloadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8}>
      <path d="M12 4v11m0 0 3.5-3.5M12 15l-3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 18.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SparklesIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11 2.5c.2 2.7 1 4.5 2.3 5.8S16.5 10 19 10.2c-2.5.2-4.4.9-5.7 2.2S11.2 15.8 11 18.5c-.2-2.7-1-4.6-2.3-5.9S5.5 10.4 3 10.2c2.5-.2 4.4-.9 5.7-2.2S10.8 5.2 11 2.5Z" />
      <path d="M18.5 15.5c.1 1.2.5 2 1.1 2.6.6.6 1.5 1 2.7 1.1-1.2.1-2.1.5-2.7 1.1-.6.6-1 1.4-1.1 2.7-.1-1.2-.5-2.1-1.1-2.7-.6-.6-1.5-1-2.7-1.1 1.2-.1 2.1-.5 2.7-1.1.6-.6 1-1.4 1.1-2.6Z" />
    </svg>
  );
}

export function TrashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.7}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
