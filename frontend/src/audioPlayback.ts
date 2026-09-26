export type PausableAudio = {
  pause: () => void;
};

export function createExclusiveAudioController() {
  let activeAudio: PausableAudio | null = null;

  return {
    activate(audio: PausableAudio) {
      if (activeAudio && activeAudio !== audio) activeAudio.pause();
      activeAudio = audio;
    },
    release(audio: PausableAudio) {
      if (activeAudio === audio) activeAudio = null;
    },
  };
}

// History rows are kept mounted while users filter or change pages, so they share one player.
export const historyAudioController = createExclusiveAudioController();
