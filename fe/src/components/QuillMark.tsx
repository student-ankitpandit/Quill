import { useId } from "react";

type QuillMarkProps = {
  size?: number;
  className?: string;
};

/** Geometric Q mark used across Quill's brand surfaces. */
export function QuillMark({ size = 20, className }: QuillMarkProps) {
  const gradientId = `quill-mark-${useId().replaceAll(":", "")}`;
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFB24F" />
          <stop offset="0.52" stopColor="#FF891F" />
          <stop offset="1" stopColor="#E96A12" />
        </linearGradient>
      </defs>
      <path
        d="M22 8H38L56 26V38L40 56H24L8 40V24L22 8Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <path
        d="M38 39L55 56"
        stroke={`url(#${gradientId})`}
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}

