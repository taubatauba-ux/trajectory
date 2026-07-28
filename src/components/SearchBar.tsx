import { SearchIcon, XIcon } from './icons';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchBar({ value, onChange, placeholder = 'Search foods', autoFocus }: SearchBarProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-hairline bg-surface px-3 py-2.5">
      <SearchIcon size={18} className="shrink-0 text-ink-muted" />
      <input
        type="text"
        inputMode="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="shrink-0 text-ink-muted"
        >
          <XIcon size={16} />
        </button>
      )}
    </div>
  );
}
