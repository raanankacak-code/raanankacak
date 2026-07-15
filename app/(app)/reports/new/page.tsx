import { Suspense } from "react";
import NewReportForm from "./NewReportForm";

export default function NewReportPage() {
  return (
    <Suspense fallback={null}>
      <NewReportForm />
    </Suspense>
  );
}
