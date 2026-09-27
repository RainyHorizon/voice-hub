import {
  AudioLines,
  Clock3,
  Code2,
  Library,
  Mic2,
  Settings2,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "创作",
    items: [
      { id: "synthesize", label: "语音合成", description: "把文字生成语音", icon: AudioLines },
      { id: "voices", label: "音色库", description: "管理、导入和试听音色", icon: Library },
      { id: "clone", label: "语音克隆", description: "上传参考音频复刻音色", icon: Mic2 },
      { id: "design", label: "语音设计", description: "用文字描述创造新音色", icon: WandSparkles },
    ],
  },
  {
    label: "管理",
    items: [
      { id: "gateway", label: "API 网关", description: "OpenAI 兼容接口与调用统计", icon: Code2 },
      { id: "history", label: "任务历史", description: "回听、下载和清理生成记录", icon: Clock3 },
      { id: "settings", label: "设置", description: "厂商凭据、存储和运行环境", icon: Settings2 },
    ],
  },
];

export const navItems = navGroups.flatMap((group) => group.items);
