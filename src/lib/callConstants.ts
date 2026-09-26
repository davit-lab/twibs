export const RING_TIMEOUT_MS = 45_000;
export const INCOMING_WATCHDOG_MS = 45_000;

/** Max time to wait for ICE to connect after SDP exchange before failing. */
export const CONNECT_TIMEOUT_MS = 30_000;
export const MAX_INCOMING_QUEUE = 2;
export const END_SCREEN_AUTO_CLOSE_MS = 4_000;

/** How long after the ring timeout a ringing row is considered abandoned. */
export const STALE_CALL_GRACE_MS = 15_000;

/** Delay before an ICE restart is attempted after a WebRTC disconnect. */
export const RECONNECT_RETRY_MS = 2_500;

export const RINGBACK_VOLUME = 0.35;
export const RINGTONE_VOLUME = 0.4;
export const END_TONE_VOLUME = 0.3;

/** Sampling interval for the connection-quality indicator. */
export const QUALITY_SAMPLE_MS = 4_000;

// ICE quality classification thresholds (round-trip time in ms)
export const QUALITY_EXCELLENT_RTT = 150;
export const QUALITY_GOOD_RTT = 400;

// negotiate candidate-pair metrics from pc.getStats()
export const START_CALL_RETRY_DELAY_MS = 500;