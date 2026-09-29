import { chromium } from '@playwright/test';

const baseURL = process.env.TWIBS_TEST_URL || 'http://localhost:8082';
const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

try {
  const context = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const a = new RTCPeerConnection({ iceServers: [] });
    const b = new RTCPeerConnection({ iceServers: [] });
    const constraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: true };
    const streamA = await navigator.mediaDevices.getUserMedia(constraints);
    const streamB = await navigator.mediaDevices.getUserMedia(constraints);
    const receivedA = new MediaStream();
    const receivedB = new MediaStream();
    a.ontrack = (event) => receivedA.addTrack(event.track);
    b.ontrack = (event) => receivedB.addTrack(event.track);
    a.onicecandidate = (event) => { if (event.candidate) void b.addIceCandidate(event.candidate); };
    b.onicecandidate = (event) => { if (event.candidate) void a.addIceCandidate(event.candidate); };
    streamA.getTracks().forEach((track) => a.addTrack(track, streamA));
    streamB.getTracks().forEach((track) => b.addTrack(track, streamB));
    const offer = await a.createOffer();
    await a.setLocalDescription(offer);
    await b.setRemoteDescription(offer);
    const answer = await b.createAnswer();
    await b.setLocalDescription(answer);
    await a.setRemoteDescription(answer);

    const waitFor = async (predicate, timeout = 8_000) => {
      const started = Date.now();
      while (!predicate()) {
        if (Date.now() - started > timeout) throw new Error('WebRTC connection timed out');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };
    await waitFor(() => a.connectionState === 'connected' && b.connectionState === 'connected' && receivedA.getAudioTracks().length === 1 && receivedB.getAudioTracks().length === 1);

    const audioA = document.createElement('audio');
    audioA.autoplay = true; audioA.srcObject = receivedA; document.body.append(audioA); await audioA.play();
    const audioB = document.createElement('audio');
    audioB.autoplay = true; audioB.srcObject = receivedB; document.body.append(audioB); await audioB.play();
    const videoB = document.createElement('video');
    videoB.autoplay = true; videoB.muted = true; videoB.playsInline = true; videoB.srcObject = receivedB; document.body.append(videoB); await videoB.play();
    await waitFor(() => videoB.videoWidth > 0 && videoB.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
    const inboundAudioBytes = async (pc) => {
      let total = 0;
      (await pc.getStats()).forEach((row) => { if (row.type === 'inbound-rtp' && row.kind === 'audio') total += row.bytesReceived || 0; });
      return total;
    };
    const beforeA = await inboundAudioBytes(a), beforeB = await inboundAudioBytes(b);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const afterA = await inboundAudioBytes(a), afterB = await inboundAudioBytes(b);

    const micA = streamA.getAudioTracks()[0];
    micA.enabled = false; const muted = !micA.enabled;
    micA.enabled = true; const unmuted = micA.enabled;
    const cameraA = streamA.getVideoTracks()[0];
    const videoSender = a.getSenders().find((sender) => sender.track?.kind === 'video');
    const audioSender = a.getSenders().find((sender) => sender.track?.kind === 'audio');
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
    const context2d = canvas.getContext('2d');
    context2d.fillStyle = '#7c3aed'; context2d.fillRect(0, 0, canvas.width, canvas.height);
    const displayStream = canvas.captureStream(15); const displayTrack = displayStream.getVideoTracks()[0];
    const displayFrames = setInterval(() => {
      context2d.fillStyle = Date.now() % 2 ? '#7c3aed' : '#111827';
      context2d.fillRect(0, 0, canvas.width, canvas.height);
    }, 100);
    const audioTrackBefore = audioSender.track;
    await videoSender.replaceTrack(displayTrack);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const audioSurvived = audioSender.track === audioTrackBefore && audioSender.track?.readyState === 'live';
    await videoSender.replaceTrack(cameraA);
    clearInterval(displayFrames);
    const cameraRestored = videoSender.track === cameraA && cameraA.readyState === 'live';
    await waitFor(() => !videoB.paused && videoB.videoWidth > 0);
    const remoteVideoElementPlaying = !videoB.paused && videoB.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

    [...streamA.getTracks(), ...streamB.getTracks(), ...displayStream.getTracks()].forEach((track) => track.stop());
    a.close(); b.close();

    // Start a second, audio-only call and let the original answerer add the
    // screen track. This exercises the harder reverse-direction flow where a
    // brand-new video m-line requires renegotiation instead of replaceTrack.
    const c = new RTCPeerConnection({ iceServers: [] });
    const d = new RTCPeerConnection({ iceServers: [] });
    const voiceC = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const voiceD = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const receivedC = new MediaStream();
    const receivedD = new MediaStream();
    c.ontrack = (event) => receivedC.addTrack(event.track);
    d.ontrack = (event) => receivedD.addTrack(event.track);
    c.onicecandidate = (event) => { if (event.candidate) void d.addIceCandidate(event.candidate); };
    d.onicecandidate = (event) => { if (event.candidate) void c.addIceCandidate(event.candidate); };
    voiceC.getTracks().forEach((track) => c.addTrack(track, voiceC));
    voiceD.getTracks().forEach((track) => d.addTrack(track, voiceD));
    const negotiate = async (offerer, answerer) => {
      const nextOffer = await offerer.createOffer();
      await offerer.setLocalDescription(nextOffer);
      await answerer.setRemoteDescription(nextOffer);
      const nextAnswer = await answerer.createAnswer();
      await answerer.setLocalDescription(nextAnswer);
      await offerer.setRemoteDescription(nextAnswer);
    };
    await negotiate(c, d);
    await waitFor(() => c.connectionState === 'connected' && d.connectionState === 'connected' && receivedC.getAudioTracks().length === 1 && receivedD.getAudioTracks().length === 1);
    const secondBeforeC = await inboundAudioBytes(c);
    const secondBeforeD = await inboundAudioBytes(d);
    const secondCanvas = document.createElement('canvas'); secondCanvas.width = 1600; secondCanvas.height = 900;
    const secondDisplay = secondCanvas.captureStream(15);
    const reverseScreenSender = d.addTrack(secondDisplay.getVideoTracks()[0], secondDisplay);
    const reverseAudioSender = d.getSenders().find((sender) => sender.track?.kind === 'audio');
    const reverseAudioTrack = reverseAudioSender.track;
    await negotiate(d, c);
    await waitFor(() => receivedC.getVideoTracks().length === 1 && receivedC.getVideoTracks()[0].readyState === 'live');
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const secondAfterC = await inboundAudioBytes(c);
    const secondAfterD = await inboundAudioBytes(d);
    const reverseScreenReachedRemote = receivedC.getVideoTracks().length === 1;
    const audioSurvivedVoiceScreenShare =
      secondAfterC > secondBeforeC &&
      secondAfterD > secondBeforeD &&
      reverseAudioSender.track === reverseAudioTrack &&
      reverseAudioTrack.readyState === 'live';
    d.removeTrack(reverseScreenSender);
    await negotiate(d, c);
    [...voiceC.getTracks(), ...voiceD.getTracks(), ...secondDisplay.getTracks()].forEach((track) => track.stop());
    c.close(); d.close();

    return {
      connected: true,
      twoWayAudioBytes: afterA > beforeA && afterB > beforeB,
      audioElementsPlaying: !audioA.paused && !audioB.paused,
      muted,
      unmuted,
      audioSurvivedScreenReplace: audioSurvived,
      cameraRestored,
      remoteVideoElementPlaying,
      allTracksEnded: [...streamA.getTracks(), ...streamB.getTracks(), ...displayStream.getTracks()].every((track) => track.readyState === 'ended'),
      connectionsClosed: a.connectionState === 'closed' && b.connectionState === 'closed',
      repeatedConnection: c.connectionState === 'closed' && d.connectionState === 'closed',
      reverseScreenReachedRemote,
      audioSurvivedVoiceScreenShare,
      secondCallTracksEnded: [...voiceC.getTracks(), ...voiceD.getTracks(), ...secondDisplay.getTracks()].every((track) => track.readyState === 'ended'),
    };
  });

  const failures = Object.entries(result).filter(([, passed]) => passed !== true);
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) throw new Error(`WebRTC verification failed: ${failures.map(([name]) => name).join(', ')}`);
} finally {
  await browser.close();
}
