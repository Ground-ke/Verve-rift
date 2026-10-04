/**
 * Web Audio API and Haptic Feedback Engine for Gate Security Scanners
 * Provides instant tactile and audio feedback for valid, duplicate, and invalid scans.
 */

class ScannerAudioEngine {
  private audioCtx: AudioContext | null = null;

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.audioCtx && AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  /**
   * Play uplifting harmonic chime for valid admission pass
   */
  playSuccessChime(): void {
    try {
      const ctx = this.getAudioContext();
      if (ctx) {
        const now = ctx.currentTime;
        // Tone 1: 880Hz (A5)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(880, now);
        gain1.gain.setValueAtTime(0.15, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // Tone 2: 1320Hz (E6 Harmonic)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1320, now + 0.08);
        gain2.gain.setValueAtTime(0.2, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.5);
      }
    } catch (e) {
      console.warn("Audio playback error:", e);
    }

    // Haptic pulse
    try {
      this.triggerHaptic([100]);
    } catch {
      // Ignored if haptic fails
    }
  }

  /**
   * Play duplicate/already scanned warning buzzer
   */
  playDuplicateTone(): void {
    try {
      const ctx = this.getAudioContext();
      if (ctx) {
        const now = ctx.currentTime;
        // Low dual buzzer tones
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sawtooth";
        osc1.frequency.setValueAtTime(220, now);
        gain1.gain.setValueAtTime(0.25, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.25);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sawtooth";
        osc2.frequency.setValueAtTime(165, now + 0.15);
        gain2.gain.setValueAtTime(0.3, now + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.45);
      }
    } catch (e) {
      console.warn("Audio playback error:", e);
    }

    // Distinct double vibration for conflict
    try {
      this.triggerHaptic([200, 100, 200]);
    } catch {
      // Ignored if haptic fails
    }
  }

  /**
   * Play invalid / counterfeit alert tone
   */
  playErrorTone(): void {
    try {
      const ctx = this.getAudioContext();
      if (ctx) {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(120, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch (e) {
      console.warn("Audio playback error:", e);
    }

    try {
      this.triggerHaptic([300, 100, 300]);
    } catch {
      // Ignored if haptic fails
    }
  }

  private triggerHaptic(pattern: number[]): void {
    try {
      if (typeof window !== "undefined" && "navigator" in window && navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignored if haptic unsupported
    }
  }
}

export const scannerAudio = new ScannerAudioEngine();
