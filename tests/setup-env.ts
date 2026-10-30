// Biến môi trường giả cho unit test: src/lib/env.ts bắt buộc có khi import; KHÔNG trỏ tới Supabase thật.
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
