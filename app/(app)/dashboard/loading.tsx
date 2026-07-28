import { SkeletonPage } from "@/components/app/Skeletons";

/** The heaviest screen in the app: four KPI counts, five list queries. */
export default function Loading() {
  return <SkeletonPage kpis={4} rows={5} cols={3} />;
}
