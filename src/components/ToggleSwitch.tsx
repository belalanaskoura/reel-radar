// Shared on/off switch, extracted so every toggle on /account (new
// releases, cinema showtimes, all-branches) renders identically instead
// of each settings component reimplementing its own slightly-different
// version, as CinemaAlertsCard and the old AlertToggles/
// BranchSubscriptionToggles previously did.
export function ToggleSwitch({
  checked,
  disabled,
  onChange,
  label,
  size = 'md',
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
  size?: 'md' | 'sm';
}) {
  const dims = size === 'md' ? { track: 'h-6 w-11', knob: 'h-5 w-5', offset: 20 } : { track: 'h-5 w-9', knob: 'h-4 w-4', offset: 16 };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      aria-label={label}
      className={`relative ${dims.track} shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60`}
      style={{ background: checked ? 'var(--accent)' : 'var(--rule)' }}
    >
      <span
        className={`absolute top-0.5 left-0.5 ${dims.knob} rounded-full bg-white shadow-sm transition-transform duration-200`}
        style={{ transform: checked ? `translateX(${dims.offset}px)` : 'translateX(0)' }}
      />
    </button>
  );
}
