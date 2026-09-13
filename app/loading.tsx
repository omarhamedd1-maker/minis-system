// شاشة التحميل — رمادي فاتح بتاعنا مع حرف M في النص (بدل الشاشة السودا)
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <span className="text-7xl font-thin tracking-wide text-ink">M</span>
    </div>
  );
}
