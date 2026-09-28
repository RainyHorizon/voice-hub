import { useEffect, useRef, type AudioHTMLAttributes } from "react";
import { appAudioController } from "../audioPlayback";

export function ExclusiveAudio({ onPlay, onPause, onEnded, ...props }: AudioHTMLAttributes<HTMLAudioElement>) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      appAudioController.release(audio);
    },
    [],
  );

  return (
    <audio
      {...props}
      ref={audioRef}
      onPlay={(event) => {
        appAudioController.activate(event.currentTarget);
        onPlay?.(event);
      }}
      onPause={(event) => {
        appAudioController.release(event.currentTarget);
        onPause?.(event);
      }}
      onEnded={(event) => {
        appAudioController.release(event.currentTarget);
        onEnded?.(event);
      }}
    />
  );
}
