import { Skeleton } from "@/components/ui";

export default function SessionsLoading() {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Skeleton className="h-10 w-48 mb-8" />
      <Skeleton className="h-16 rounded-2xl mb-6" />
      <div className="flex gap-2 mb-6">
        {[0,1,2,3].map(i => <Skeleton key={i} className="h-8 w-20 rounded-full" />)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[0,1,2,3,4,5].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)}
      </div>
    </div>
  );
}
