type RingtoneHandle = {
  start: () => void;
  stop: () => void;
};

// Creates a phone-style ringtone using Web Audio API
// Pattern: Two short beeps, pause, repeat
export function createRingtone(): RingtoneHandle {
  let audioContext: AudioContext | null = null;
  let oscillator: OscillatorNode | null = null;
  let gainNode: GainNode | null = null;
  let intervalId: number | null = null;
  let isPlaying = false;

  const frequencies = {
    high: 480,
    low: 440,
  };

  const initAudio = () => {
    if (audioContext) return;
    
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContext = new AudioContextClass();
      
      gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      gainNode.connect(audioContext.destination);
      
      oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequencies.high;
      oscillator.connect(gainNode);
      oscillator.start();
      
      console.log('[Ringtone] Audio initialized');
    } catch (error) {
      console.error('[Ringtone] Failed to initialize audio:', error);
    }
  };

  const playRingPattern = () => {
    if (!audioContext || !gainNode || !oscillator) return;

    const now = audioContext.currentTime;
    
    // Cancel any scheduled values
    gainNode.gain.cancelScheduledValues(now);
    oscillator.frequency.cancelScheduledValues(now);
    
    // Ring pattern: beep-beep ... pause ... repeat
    // First beep (high tone)
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.15, now + 0.02);
    oscillator.frequency.setValueAtTime(frequencies.high, now);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.15);
    
    // Second beep (slightly lower)
    gainNode.gain.setValueAtTime(0, now + 0.2);
    gainNode.gain.linearRampToValueAtTime(0.15, now + 0.22);
    oscillator.frequency.setValueAtTime(frequencies.low, now + 0.2);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.35);
    
    // Third beep (back to high)
    gainNode.gain.setValueAtTime(0, now + 0.4);
    gainNode.gain.linearRampToValueAtTime(0.12, now + 0.42);
    oscillator.frequency.setValueAtTime(frequencies.high, now + 0.4);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.55);
  };

  const start = () => {
    if (isPlaying) return;
    isPlaying = true;

    initAudio();
    
    if (!audioContext) {
      console.warn('[Ringtone] Audio context not available');
      return;
    }

    // Resume if suspended (autoplay policy)
    if (audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        console.log('[Ringtone] Audio context resumed');
        playRingPattern();
      }).catch((err) => {
        console.warn('[Ringtone] Could not resume audio:', err);
      });
    } else {
      playRingPattern();
    }

    // Repeat pattern every 2 seconds
    intervalId = window.setInterval(() => {
      if (audioContext?.state === 'running') {
        playRingPattern();
      }
    }, 2000);
    
    console.log('[Ringtone] Started');
  };

  const stop = () => {
    if (!isPlaying) return;
    isPlaying = false;

    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = null;
    }

    // Fade out gracefully
    if (gainNode && audioContext) {
      try {
        const now = audioContext.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
      } catch {
        // Ignore errors during cleanup
      }
    }

    // Cleanup audio resources
    setTimeout(() => {
      try {
        oscillator?.stop();
        oscillator?.disconnect();
      } catch {
        // Already stopped
      }
      
      try {
        gainNode?.disconnect();
      } catch {
        // Already disconnected
      }
      
      try {
        audioContext?.close();
      } catch {
        // Already closed
      }

      oscillator = null;
      gainNode = null;
      audioContext = null;
    }, 150);

    console.log('[Ringtone] Stopped');
  };

  return { start, stop };
}

// Alternative: Use an audio file for more realistic ringtone
export function createAudioFileRingtone(audioUrl: string): RingtoneHandle {
  let audio: HTMLAudioElement | null = null;
  let isPlaying = false;

  const start = () => {
    if (isPlaying) return;
    isPlaying = true;

    audio = new Audio(audioUrl);
    audio.loop = true;
    audio.volume = 0.7;
    
    audio.play().catch((error) => {
      console.warn('[Ringtone] Autoplay blocked:', error);
      isPlaying = false;
    });
    
    console.log('[Ringtone] Audio file started');
  };

  const stop = () => {
    if (!isPlaying || !audio) return;
    isPlaying = false;

    audio.pause();
    audio.currentTime = 0;
    audio = null;
    
    console.log('[Ringtone] Audio file stopped');
  };

  return { start, stop };
}
