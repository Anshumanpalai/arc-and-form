export function ProductSkeleton() {
  return (
    <div className="space-y-3">
      <div className="aspect-[3/4] w-full border border-stone-200 bg-[#EAE7E0] shimmer-mask" />
      <div className="h-2.5 w-1/4 bg-[#EAE7E0] shimmer-mask" />
      <div className="flex justify-between">
        <div className="h-3.5 w-2/3 bg-[#EAE7E0] shimmer-mask" />
        <div className="h-3.5 w-1/5 bg-[#EAE7E0] shimmer-mask" />
      </div>
    </div>
  );
}
