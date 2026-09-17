import { SkeletonHeader, SkeletonList } from "@/components/Skeleton";

// الهيكل من مكوّن واحد لكل السيستم (`components/Skeleton.tsx`)
export default function Loading() {
  return (
    <div>
      <SkeletonHeader />
      <SkeletonList />
    </div>
  );
}
