export type ProviderSelectorOption = {
  id: string;
  label: string;
  mark: string;
  tone: string;
  detail: string;
  indicator?: "active" | "saved" | "idle";
};

export function ProviderSelector({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: ProviderSelectorOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={`provider-selector${className ? ` ${className}` : ""}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          className={value === option.id ? "provider-choice selected" : "provider-choice"}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          key={option.id}
        >
          <span className={`provider-mark ${option.tone}`}>{option.mark}</span>
          <span className="provider-choice-copy">
            <strong>{option.label}</strong>
            <small>{option.detail}</small>
          </span>
          {option.indicator && (
            <span className={`provider-choice-indicator ${option.indicator}`} aria-hidden="true" />
          )}
        </button>
      ))}
    </div>
  );
}
