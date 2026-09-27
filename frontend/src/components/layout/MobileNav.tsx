import { Menu, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BrandMark, NavList } from "./AppSidebar";
import { navItems } from "./nav";

type MobileNavProps = {
  active: string;
  onSelect: (id: string) => void;
  onOpenCommand: () => void;
};

export function MobileNav({ active, onSelect, onOpenCommand }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const current = navItems.find((item) => item.id === active);

  return (
    <header className="glass sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-4 md:hidden">
      <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="打开导航菜单">
        <Menu />
      </Button>
      <BrandMark className="size-7 rounded-[10px] [&_svg]:size-4" />
      <strong className="flex-1 truncate text-[15px] font-semibold">{current?.label || "Voice Hub"}</strong>
      <Button variant="ghost" size="icon-sm" onClick={onOpenCommand} aria-label="打开命令面板">
        <Search />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="glass w-[280px] gap-0 px-3 pt-5">
          <SheetHeader className="flex-row items-center gap-3 px-2 pb-6">
            <BrandMark />
            <div>
              <SheetTitle className="text-[15px] font-bold">Voice Hub</SheetTitle>
              <SheetDescription className="text-xs">多厂商语音工作台</SheetDescription>
            </div>
          </SheetHeader>
          <NavList
            active={active}
            onSelect={(id) => {
              onSelect(id);
              setOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>
    </header>
  );
}
