import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: ReactNode;
  htmlFor?: string;
  /** 标签行右侧的附加内容，例如字数统计或模式切换按钮。 */
  aside?: ReactNode;
  /** 控件下方的说明文字。 */
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** 表单字段：小号标签 + 控件 + 可选说明，统一各页面的间距与字色。 */
export function Field({ label, htmlFor, aside, hint, className, children }: FieldProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex min-h-5 items-center justify-between gap-3">
        <Label htmlFor={htmlFor} className="text-[13px] text-soft">
          {label}
        </Label>
        {aside}
      </div>
      {children}
      {hint && <p className="m-0 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** 浅蓝提示条，用于操作说明、费用与安全提示。 */
export function Note({ icon, children, className }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "m-0 flex gap-2 rounded-md bg-accent/60 px-3 py-2.5 text-xs leading-relaxed text-accent-foreground [&>svg]:mt-px [&>svg]:size-4 [&>svg]:shrink-0",
        className,
      )}
    >
      {icon}
      <span>{children}</span>
    </p>
  );
}
