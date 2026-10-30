/** Kết quả chuẩn của Server Action: không throw ra client, luôn trả về dạng có thể phân nhánh. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
