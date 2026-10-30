"use client";

import { useEffect, useState } from "react";
import { Navigation, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appleDirectionsUrl, displayPhone, googleDirectionsUrl, telHref, type CampusProfile } from "@/config/campuses";
import { cn } from "@/lib/utils";

/**
 * "Chỉ đường ngay" 1 chạm: Google Maps chỉ đường từ VỊ TRÍ HIỆN TẠI tới cơ sở (điện thoại có app → mở thẳng app).
 * iPhone: thêm nút Apple Maps (app Bản đồ có sẵn). Nhận diện iPhone sau khi hiển thị → HTML server / client khớp nhau.
 */
export function DirectionsButtons({ campus, withCall = true, className }: { campus: CampusProfile; withCall?: boolean; className?: string }) {
  const [ios, setIos] = useState(false);
  useEffect(() => {
    setIos(/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  }, []);
  const contact = campus.contacts[0];

  return (
    <div className={cn("grid gap-2", className)}>
      <Button asChild className="h-12 rounded-2xl text-base shadow-md shadow-primary/20">
        <a href={googleDirectionsUrl(campus)} target="_blank" rel="noopener noreferrer" aria-label={`Chỉ đường tới TH EDU ${campus.name} bằng Google Maps`}>
          <Navigation className="size-5" /> Chỉ đường ngay
        </a>
      </Button>
      <div className={cn("grid gap-2", ios && withCall && contact ? "grid-cols-2" : ios || (withCall && contact) ? "grid-cols-1" : "hidden")}>
        {ios && (
          <Button asChild variant="outline" className="h-11 rounded-2xl">
            <a href={appleDirectionsUrl(campus)} target="_blank" rel="noopener noreferrer">
              Apple Maps
            </a>
          </Button>
        )}
        {withCall && contact && (
          <Button asChild variant="outline" className="h-11 rounded-2xl">
            <a href={telHref(contact.phone)} aria-label={`Gọi ${contact.name} ${displayPhone(contact.phone)}`}>
              <Phone /> Gọi {contact.name}
            </a>
          </Button>
        )}
      </div>
      {!campus.locationVerified && (
        <p className="text-center text-xs text-muted-foreground">Chỉ đường theo địa chỉ — Google Maps tự tìm đúng số nhà.</p>
      )}
    </div>
  );
}
