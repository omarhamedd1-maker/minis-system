"use client";

export function ConfirmButton({
  message,
  className,
  children,
  title,
  "aria-label": ariaLabel,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
  /** للزراير اللي أيقونة بس — عشان يبان معناها */
  title?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      title={title}
      aria-label={ariaLabel}
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
