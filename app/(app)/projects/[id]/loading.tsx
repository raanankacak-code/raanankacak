import { SkeletonPage } from "@/components/app/Skeletons";

/** Project detail: workers, documents, counts and the latest report. */
export default function Loading() {
  return <SkeletonPage kpis={4} rows={6} cols={4} />;
}
