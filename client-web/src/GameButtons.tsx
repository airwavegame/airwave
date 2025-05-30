import { useAtom } from 'solid-jotai';
import { WhisperSTT } from './whisper/WhisperSTT';
import {
  frequencyAtom,
  frequencyAtomKey,
  isRecordingAtom,
  useTTSAtom,
  useTTSAtomKey,
} from './lib/atoms';
import { createSignal, onMount } from 'solid-js';
import { useStorageAtom } from './lib/hooks';
import { baseAPIPath, getMessages } from './lib/api';
import { useQueryClient } from '@tanstack/solid-query';

export default function GameButtons() {
  const whisper = new WhisperSTT();

  const [isRecording, setIsRecording] = useAtom(isRecordingAtom);
  const [frequency] = useStorageAtom(frequencyAtomKey, frequencyAtom);
  const [useTTS, setUseTTS] = useStorageAtom(useTTSAtomKey, useTTSAtom);
  const [downButtons, setDownButtons] = createSignal<number>(0);

  const client = useQueryClient();

  async function getMedia(constraints: MediaStreamConstraints) {
    await navigator.mediaDevices.getUserMedia(constraints);
  }

  function startRecording() {
    whisper.startRecording();
    setIsRecording(true);
  }

  async function stopRecording() {
    setIsRecording(false);
    whisper.stopRecording(async (blob) => {
      const value = await blob.arrayBuffer();
      await fetch(`${baseAPIPath}/api/comms/voice?frequency=${frequency()}`, {
        body: value,
        method: 'POST',
      });
      await client.invalidateQueries({
        queryKey: [getMessages],
        type: 'all',
        exact: true,
      });
      await client.refetchQueries({
        queryKey: [getMessages],
        type: 'all',
        exact: true,
      });
    });
  }

  function discardRecording() {
    whisper.abortRecording();
    setIsRecording(false);
  }

  onMount(async () => {
    await getMedia({ audio: true, video: false });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Insert' && !isRecording()) {
        startRecording();
      } else if (e.key === 'Pause') {
        sendPause();
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Insert' && isRecording()) {
        stopRecording();
      } else if (e.key === 'Delete' && isRecording()) {
        discardRecording();
      }
    });

    function gameLoop() {
      const gamepads = navigator.getGamepads();
      if (gamepads) {
        const gp = gamepads[0];
        if (gp) {
          let newDownButtons = 0;
          for (const i in gp.buttons) {
            const button = gp.buttons[i];
            if (button?.pressed) {
              newDownButtons++;
            }
          }

          if (newDownButtons !== downButtons()) {
            // If one button is pressed, use as PTT.
            if (newDownButtons === 1 && downButtons() === 0) {
              if (!isRecording()) {
                startRecording();
              }

              // If two or more buttons are pressed, stop recording.
            } else if (newDownButtons === 0 && downButtons() === 1) {
              if (isRecording()) {
                stopRecording();
              }
            } else if (newDownButtons > 1) {
              if (isRecording()) {
                discardRecording();
              }
            }

            setDownButtons(newDownButtons);
          }
        }
      }

      requestAnimationFrame(gameLoop);
    }

    gameLoop();
  });

  async function sendPause() {
    await fetch(`${baseAPIPath}/api/pause`, {
      method: 'POST',
    });
  }

  function toggleTTS() {
    setUseTTS((useTTS) => !useTTS);
  }

  return (
    <div id="game-buttons">
      <button
        classList={{ 'tts-toggle': true, enabled: useTTS() }}
        onClick={toggleTTS}
      >
        {useTTS() ? 'Disable TTS' : 'Enable TTS'}
      </button>
      <button
        class={`talk-button ${isRecording() ? 'recording' : ''}`}
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
      >
        {isRecording() ? 'Recording...' : 'Talk'}
      </button>
      <button class="discard-button" onClick={discardRecording}>
        Discard
      </button>
      <button class="pause-button" onClick={sendPause}>
        Pause
      </button>
    </div>
  );
}
