// Push notification utilities for call notifications
// Uses the Web Push API with browser notifications

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, any>;
  requireInteraction?: boolean;
}

// Check if notifications are supported
export const isNotificationSupported = (): boolean => {
  return 'Notification' in window && 'serviceWorker' in navigator;
};

// Request notification permission
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!isNotificationSupported()) {
    console.warn('[Push] Notifications not supported');
    return 'denied';
  }

  const permission = await Notification.requestPermission();
  console.log('[Push] Permission:', permission);
  return permission;
};

// Get current notification permission
export const getNotificationPermission = (): NotificationPermission => {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
};

// Show a notification
export const showNotification = async (payload: PushNotificationPayload): Promise<Notification | null> => {
  if (!isNotificationSupported()) {
    console.warn('[Push] Notifications not supported');
    return null;
  }

  if (Notification.permission !== 'granted') {
    console.warn('[Push] Notification permission not granted');
    return null;
  }

  try {
    // Use the Notification API directly for foreground notifications
    const notification = new Notification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/favicon.ico',
      tag: payload.tag,
      data: payload.data,
      requireInteraction: payload.requireInteraction ?? false,
    });

    notification.onclick = () => {
      window.focus();
      if (payload.data?.url) {
        window.location.href = payload.data.url;
      }
      notification.close();
    };

    return notification;
  } catch (error) {
    console.error('[Push] Failed to show notification:', error);
    return null;
  }
};

// Show incoming call notification
export const showIncomingCallNotification = async (
  callerName: string,
  callType: 'audio' | 'video',
  conversationId: string,
  avatarUrl?: string | null
): Promise<Notification | null> => {
  // Play a sound for incoming calls (browser notification sound)
  try {
    // Create an audio context for the ringtone effect
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 440;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.1;
    
    oscillator.start();
    
    // Ring pattern
    setTimeout(() => {
      gainNode.gain.value = 0;
      setTimeout(() => {
        gainNode.gain.value = 0.1;
        setTimeout(() => {
          oscillator.stop();
        }, 200);
      }, 100);
    }, 200);
  } catch (e) {
    // Audio context may not be available
  }

  return showNotification({
    title: `${callerName} is calling...`,
    body: `Incoming ${callType} call`,
    icon: avatarUrl || '/favicon.ico',
    tag: `call-${conversationId}`,
    requireInteraction: true,
    data: {
      type: 'incoming_call',
      conversationId,
      url: `/messages?conv=${conversationId}`,
    },
  });
};

// Close a specific notification by tag
export const closeNotification = (tag: string) => {
  // Note: We can't close notifications created with new Notification()
  // This would work with Service Worker notifications
  console.log('[Push] Close notification:', tag);
};
