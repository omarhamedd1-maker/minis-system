// علامة بوسطة — السداسي بلون الشعار الأحمر، بتتحط جوه أزرار عادية
export function BostaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="#E30613"
    >
      <path d="M12 2.2 21 7v10l-9 4.8L3 17V7l9-4.8Zm0 2.6L5.4 8.3v7.4L12 19.2l6.6-3.5V8.3L12 4.8Z" />
      <path d="M12 7.6 16.6 10v4l-4.6 2.4L7.4 14v-4L12 7.6Z" />
    </svg>
  );
}
