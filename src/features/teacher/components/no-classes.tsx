export function NoClasses() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-10 text-center">
      <span className="text-4xl" aria-hidden>
        🏫
      </span>
      <p className="mt-2 font-semibold">Bạn chưa được phân công lớp nào</p>
      <p className="mt-1 text-sm text-muted-foreground">Vui lòng liên hệ quản trị viên để được phân công lớp học.</p>
    </div>
  );
}
