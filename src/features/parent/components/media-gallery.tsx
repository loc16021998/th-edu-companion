"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaImage } from "@/components/shared/media-image";
import type { MediaItem } from "@/features/daily-reports/media";
import { Lightbox } from "./lightbox";

const MAX_TILES = 6;

export function MediaGallery({ items }: { items: MediaItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const tiles = items.slice(0, MAX_TILES);
  const hidden = items.length - tiles.length;
  const featured = items.length >= 3; // ô đầu tiên to gấp đôi cho sinh động

  return (
    <>
      <ul className="grid grid-cols-3 gap-1.5 overflow-hidden rounded-2xl">
        {tiles.map((item, i) => {
          const isLast = i === tiles.length - 1 && hidden > 0;
          return (
            <li key={item.url} className={cn("relative", featured && i === 0 && "col-span-2 row-span-2")}>
              <button
                type="button"
                onClick={() => setOpenIndex(i)}
                aria-label={`Xem ${item.type === "video" ? "video" : "ảnh"} ${i + 1}`}
                className="group relative block aspect-square w-full overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                {item.type === "video" ? (
                  // #t=0.1 để iOS Safari hiển thị khung hình đầu làm thumbnail
                  <video
                    src={`${item.url}#t=0.1`}
                    preload="metadata"
                    muted
                    playsInline
                    className="pointer-events-none size-full object-cover"
                  />
                ) : (
                  <MediaImage
                    src={item.url}
                    alt=""
                    fill
                    sizes={featured && i === 0 ? "(min-width: 768px) 420px, 66vw" : "(min-width: 768px) 210px, 33vw"}
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )}
                {item.type === "video" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <span className="flex size-10 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow">
                      <Play className="ml-0.5 size-5 fill-current" />
                    </span>
                  </span>
                )}
                {isLast && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenIndex(i + 1);
                    }}
                    className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-bold text-white"
                  >
                    +{hidden}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {openIndex !== null && (
        <Lightbox items={items} index={openIndex} onIndexChange={setOpenIndex} onClose={() => setOpenIndex(null)} />
      )}
    </>
  );
}
