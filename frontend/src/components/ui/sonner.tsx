import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-brand" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin text-brand" />,
      }}
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !shadow-float !font-sans !gap-3 backdrop-blur-xl",
          description: "!text-muted-foreground",
          actionButton: "!rounded-sm !bg-primary !text-primary-foreground",
          cancelButton: "!rounded-sm",
        },
      }}
      style={
        {
          "--normal-bg": "rgb(255 255 255 / 0.92)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-lg)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
