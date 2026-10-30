import { AdmissionsTabs } from "@/features/admissions/components/admissions-tabs";

export default function AdmissionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">Tuyển sinh & học thử</h1>
        <p className="text-sm text-muted-foreground">
          Học sinh tiềm năng của CS1 Xa La & CS2 Ngô Thì Nhậm: tư vấn → học thử → giáo viên đánh giá → chốt khoá học.
        </p>
      </div>
      <AdmissionsTabs />
      {children}
    </div>
  );
}
