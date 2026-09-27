import { useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, Note } from "../form/Field";
import type { Voice } from "../../types";

export function RenameVoiceDialog({
  voice,
  onClose,
  onRename,
}: {
  voice: Voice;
  onClose: () => void;
  onRename: (displayName: string) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(voice.display_name);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const value = displayName.trim();
  const unchanged = !value || value === voice.display_name;

  const submit = async () => {
    if (unchanged) return;
    setWorking(true);
    setMessage("");
    try {
      await onRename(value);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重命名失败");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !working && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!working}
        onEscapeKeyDown={(event) => working && event.preventDefault()}
        onInteractOutside={(event) => working && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>重命名音色</DialogTitle>
          <DialogDescription>只修改界面中显示的名称。</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label="显示名称" htmlFor="rename-voice-name">
            <Input
              id="rename-voice-name"
              autoFocus
              maxLength={100}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>
          <div className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2.5 text-xs">
            <span className="text-muted-foreground">兼容别名</span>
            <code className="truncate font-mono text-foreground">{voice.public_name}</code>
          </div>
          <Note icon={<ShieldCheck />}>
            现有 API 调用、任务记录和厂商 Voice ID 不受影响。
          </Note>
          {message && (
            <p role="status" aria-live="polite" className="m-0 text-sm text-destructive">
              {message}
            </p>
          )}
          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={working}>
              取消
            </Button>
            <Button type="submit" disabled={working || unchanged}>
              <Save />
              {working ? "正在保存…" : "保存名称"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
