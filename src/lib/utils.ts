import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Tên gọi = chữ cuối trong họ tên Việt Nam ("Nguyễn Minh An" → "An"). */
export function givenName(fullName: string) {
  return fullName.trim().split(/\s+/).pop() ?? fullName;
}

const vndFormatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

export function formatVND(amount: number) {
  return vndFormatter.format(amount);
}
