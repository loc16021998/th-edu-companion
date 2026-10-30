"use client";

import { useState, useTransition } from "react";
import { Loader2, Star, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/shared/form-field";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { Json } from "@/types/database.types";
import { submitTrialAssessment } from "../actions";
import { ASSESSMENT_LEVELS, TRIAL_TEXT_MAX, programLabel, trialSkills, type AssessmentLevel } from "../constants";

export type AssessableTrial = {
  id: string;
  program: string;
  status: string;
  assessment_level: number | null;
  assessment_skills: Json;
  strengths: string | null;
  improvements: string | null;
  recommendation: string | null;
};

const LEVELS = Object.entries(ASSESSMENT_LEVELS).map(([k, v]) => ({
  level: Number(k) as AssessmentLevel,
  ...v,
}));

function skillsOf(json: Json): Record<string, number> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  return Object.fromEntries(Object.entries(json).filter((e): e is [string, number] => typeof e[1] === "number"));
}

/** 5 ngôi sao chạm được (44px) — chạm lại sao đang chọn để bỏ chấm. */
function StarRating({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
      <span className="text-sm font-medium">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} sao`}
            onClick={() => onChange(value === n ? 0 : n)}
            className="tap flex size-9 items-center justify-center rounded-lg"
          >
            <Star className={cn("size-6 transition-colors", n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Giáo viên đánh giá nhanh năng lực ban đầu sau buổi học thử (hoặc báo bé không đến). */
export function TrialAssessmentForm({ trial, onDone }: { trial: AssessableTrial; onDone?: () => void }) {
  const [pending, startTransition] = useTransition();
  const [level, setLevel] = useState<number | null>(trial.assessment_level);
  const [skills, setSkills] = useState<Record<string, number>>(skillsOf(trial.assessment_skills));
  const [strengths, setStrengths] = useState(trial.strengths ?? "");
  const [improvements, setImprovements] = useState(trial.improvements ?? "");
  const [recommendation, setRecommendation] = useState(trial.recommendation ?? "");
  const [error, setError] = useState<string | null>(null);
  const criteria = trialSkills(trial.program);

  const submit = (attended: boolean) => {
    setError(null);
    startTransition(async () => {
      const res = await submitTrialAssessment({
        trialId: trial.id,
        attended,
        level: attended ? level : null,
        skills: attended ? Object.fromEntries(Object.entries(skills).filter(([, v]) => v > 0)) : {},
        strengths,
        improvements,
        recommendation,
      });
      if (!res.ok) {
        setError(res.error);
        toast.error("Chưa gửi được đánh giá", res.error);
        return;
      }
      toast.success(attended ? "Đã gửi đánh giá — tư vấn viên nhận được ngay" : "Đã ghi nhận bé không đến học thử");
      onDone?.();
    });
  };

  const area = cn(fieldClass, "h-auto resize-y py-2.5");

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">Năng lực ban đầu của bé · {programLabel(trial.program)}</legend>
        <div className="grid grid-cols-2 gap-2">
          {LEVELS.map((l) => (
            <button
              key={l.level}
              type="button"
              aria-pressed={level === l.level}
              onClick={() => setLevel(l.level)}
              className={cn(
                "tap flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 text-center text-sm font-semibold ring-1 transition-colors",
                level === l.level ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border",
              )}
            >
              <span className="text-lg leading-none" aria-hidden>
                {l.emoji}
              </span>
              {l.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1 rounded-xl bg-muted/50 p-3">
        <legend className="sr-only">Kỹ năng</legend>
        <p className="text-xs font-semibold text-muted-foreground">Chấm nhanh từng kỹ năng (không bắt buộc)</p>
        {Object.entries(criteria).map(([key, label]) => (
          <StarRating key={key} label={label} value={skills[key] ?? 0} onChange={(v) => setSkills((s) => ({ ...s, [key]: v }))} />
        ))}
      </fieldset>

      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Điểm mạnh của bé</span>
          <textarea
            rows={2}
            maxLength={TRIAL_TEXT_MAX}
            value={strengths}
            onChange={(e) => setStrengths(e.target.value)}
            className={area}
            placeholder="Vd: nhận biết nhanh, mạnh dạn phát biểu"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Cần cải thiện</span>
          <textarea
            rows={2}
            maxLength={TRIAL_TEXT_MAX}
            value={improvements}
            onChange={(e) => setImprovements(e.target.value)}
            className={area}
            placeholder="Vd: cầm bút chưa đúng, chưa tập trung lâu"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Đề xuất lộ trình / lớp phù hợp</span>
          <textarea
            rows={2}
            maxLength={TRIAL_TEXT_MAX}
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value)}
            className={area}
            placeholder="Vd: nên vào lớp K1A, học 3 buổi/tuần"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive ring-1 ring-destructive/20">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" className="h-11 flex-1 rounded-xl" disabled={pending || level === null} onClick={() => submit(true)}>
          {pending && <Loader2 className="animate-spin" />} Gửi đánh giá
        </Button>
        {trial.status !== "completed" && (
          <Button type="button" variant="outline" className="h-11 rounded-xl" disabled={pending} onClick={() => submit(false)}>
            <UserX /> Bé không đến
          </Button>
        )}
      </div>
    </div>
  );
}

/** Kết quả đánh giá (thẻ tư vấn viên đọc để chốt khoá học). */
export function TrialAssessmentSummary({ trial }: { trial: AssessableTrial }) {
  const level = trial.assessment_level ? ASSESSMENT_LEVELS[trial.assessment_level as AssessmentLevel] : null;
  if (!level) return null;
  const criteria = trialSkills(trial.program);
  const skills = Object.entries(skillsOf(trial.assessment_skills));

  return (
    <div className="space-y-2 rounded-xl bg-emerald-50/60 p-3 ring-1 ring-emerald-100">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Đánh giá của giáo viên</p>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold ring-1", level.tone)}>
          {level.emoji} {level.label}
        </span>
      </div>
      {skills.length > 0 && (
        <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {skills.map(([key, v]) => (
            <li key={key} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{criteria[key] ?? key}</span>
              <span className="flex shrink-0" aria-label={`${v}/5 sao`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={cn("size-3.5", n <= v ? "fill-amber-400 text-amber-400" : "text-slate-300")} aria-hidden />
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {trial.strengths && (
        <p className="text-sm">
          <span className="font-semibold">Điểm mạnh:</span> {trial.strengths}
        </p>
      )}
      {trial.improvements && (
        <p className="text-sm">
          <span className="font-semibold">Cần cải thiện:</span> {trial.improvements}
        </p>
      )}
      {trial.recommendation && (
        <p className="text-sm">
          <span className="font-semibold">Đề xuất:</span> {trial.recommendation}
        </p>
      )}
    </div>
  );
}
