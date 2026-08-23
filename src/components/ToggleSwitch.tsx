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
    // The visual track stays iOS-switch-sized (24px/20px tall) rather
    // than being blown up to a 44px touch target -- that would look
    // wrong for this control. Instead the button's real hit area is
    // padded out via -m-2.5/p-2.5 (invisible, doesn't affect layout
    // since the negative margin cancels the padding) so a mobile tap
    // has real room around the visually small switch.
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      aria-label={label}
      className="-m-2.5 shrink-0 rounded-full p-2.5 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        className={`relative block ${dims.track} rounded-full transition-colors duration-200`}
        style={{ background: checked ? 'var(--accent)' : 'var(--rule)' }}
      >
        <span
          className={`absolute top-0.5 left-0.5 ${dims.knob} rounded-full bg-white shadow-sm transition-transform duration-200`}
          style={{ transform: checked ? `translateX(${dims.offset}px)` : 'translateX(0)' }}
        />
      </span>
    </button>
  );
}
