import { SkeletonPage } from "@/components/app/Skeletons";

export default function Loading() {
  return <SkeletonPage kpis={4} rows={6} cols={5} />;
}
