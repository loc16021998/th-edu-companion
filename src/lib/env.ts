// Biến NEXT_PUBLIC_* phải được truy cập tĩnh để Next.js inline vào bundle client.
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Thiếu biến môi trường: ${name}. Xem .env.example`);
  return value;
}

export const env = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
};
