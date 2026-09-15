export function WorkspaceHero({
  title,
  accent,
  description,
  className = "",
}: {
  title: string;
  accent: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={`workspace-hero${className ? ` ${className}` : ""}`}>
      <h2>
        {title}
        <br />
        <em>{accent}</em>
      </h2>
      {description && <p>{description}</p>}
    </div>
  );
}
