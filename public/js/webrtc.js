// WhatsApp-Grade Peer-to-Peer WebRTC Mesh Audio & Video Calling Manager
class WebRTCManager {
  constructor(socket) {
    this.socket = socket;
    this.localStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.audioMeterInterval = null;

    this.videoEnabled = true;
    this.audioEnabled = true;

    // Map: peerId -> RTCPeerConnection
    this.peers = new Map();
    // Map: peerId -> remote MediaStream
    this.remoteStreams = new Map();

    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };

    this.setupSocketListeners();
  }

  // Initialize local webcam & microphone
  async initLocalMedia(previewElementId = 'lobby-video-preview') {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const previewEl = document.getElementById(previewElementId);
      if (previewEl) {
        previewEl.srcObject = this.localStream;
      }

      this.setupAudioMeter();
      return true;
    } catch (err) {
      console.warn('Camera/Microphone access not granted or unavailable:', err.message);
      // Create silent/blank dummy stream for testing if hardware unavailable
      this.createDummyStream();
      return false;
    }
  }

  createDummyStream() {
    // Generate black canvas dummy video track
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 320, 240);
    const stream = canvas.captureStream(10);

    // Generate silent Web Audio track
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const actx = new AudioCtx();
      const osc = actx.createOscillator();
      const dst = actx.createMediaStreamDestination();
      osc.connect(dst);
      osc.start();
      const audioTrack = dst.stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
        stream.addTrack(audioTrack);
      }
    } catch (e) {}

    this.localStream = stream;
  }

  setupAudioMeter() {
    if (!this.localStream) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (!audioTrack) return;

      this.microphone = this.audioContext.createMediaStreamSource(this.localStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.microphone.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      clearInterval(this.audioMeterInterval);
      this.audioMeterInterval = setInterval(() => {
        if (!this.audioEnabled) {
          this.updateLocalSoundwave(0);
          return;
        }
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        this.updateLocalSoundwave(average);
      }, 100);
    } catch (e) {
      console.warn('AudioMeter setup failed:', e);
    }
  }

  updateLocalSoundwave(level) {
    // Update lobby bar if visible
    const lobbyFill = document.getElementById('mic-level-fill');
    if (lobbyFill) {
      const pct = Math.min(100, Math.round((level / 60) * 100));
      lobbyFill.style.width = `${pct}%`;
    }

    // Update in-game local audio sound wave
    const waveEl = document.getElementById('local-audio-wave');
    const localCard = document.getElementById('local-video-card');
    if (waveEl) {
      if (level > 12) {
        waveEl.classList.add('active');
        localCard && localCard.classList.add('speaking');
      } else {
        waveEl.classList.remove('active');
        localCard && localCard.classList.remove('speaking');
      }
    }
  }

  toggleCamera() {
    this.videoEnabled = !this.videoEnabled;
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = this.videoEnabled;
      });
    }

    // Update UI placeholders
    const lobbyOverlay = document.getElementById('lobby-cam-off-overlay');
    const inGamePlaceholder = document.getElementById('local-cam-off-placeholder');
    if (lobbyOverlay) lobbyOverlay.classList.toggle('hidden', this.videoEnabled);
    if (inGamePlaceholder) inGamePlaceholder.classList.toggle('hidden', this.videoEnabled);

    this.socket.emit('webrtc-media-toggle', {
      videoEnabled: this.videoEnabled,
      audioEnabled: this.audioEnabled
    });

    return this.videoEnabled;
  }

  toggleMicrophone() {
    this.audioEnabled = !this.audioEnabled;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = this.audioEnabled;
      });
    }

    const localWave = document.getElementById('local-audio-wave');
    if (localWave) {
      localWave.classList.toggle('muted', !this.audioEnabled);
    }

    this.socket.emit('webrtc-media-toggle', {
      videoEnabled: this.videoEnabled,
      audioEnabled: this.audioEnabled
    });

    return this.audioEnabled;
  }

  // Connect to new peer (Mesh topology)
  async callPeer(peerId, isInitiator = false) {
    if (this.peers.has(peerId)) return;

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peers.set(peerId, pc);

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc-ice-candidate', {
          targetId: peerId,
          candidate: event.candidate
        });
      }
    };

    // Remote Track handler
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      this.remoteStreams.set(peerId, remoteStream);
      this.attachRemoteVideo(peerId, remoteStream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.removePeer(peerId);
      }
    };

    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.socket.emit('webrtc-offer', {
          targetId: peerId,
          sdp: offer
        });
      } catch (err) {
        console.error('Error creating WebRTC offer:', err);
      }
    }
  }

  setupSocketListeners() {
    // Incoming Offer
    this.socket.on('webrtc-offer', async ({ senderId, sdp }) => {
      let pc = this.peers.get(senderId);
      if (!pc) {
        await this.callPeer(senderId, false);
        pc = this.peers.get(senderId);
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.socket.emit('webrtc-answer', {
          targetId: senderId,
          sdp: answer
        });
      } catch (err) {
        console.error('Error answering WebRTC call:', err);
      }
    });

    // Incoming Answer
    this.socket.on('webrtc-answer', async ({ senderId, sdp }) => {
      const pc = this.peers.get(senderId);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (err) {
          console.error('Error setting remote answer:', err);
        }
      }
    });

    // Incoming ICE Candidate
    this.socket.on('webrtc-ice-candidate', async ({ senderId, candidate }) => {
      const pc = this.peers.get(senderId);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    });

    // Remote peer toggled audio/video
    this.socket.on('webrtc-peer-media-toggle', ({ peerId, videoEnabled, audioEnabled }) => {
      const card = document.getElementById(`video-card-${peerId}`);
      if (!card) return;

      const placeholder = card.querySelector('.video-placeholder');
      const wave = card.querySelector('.audio-wave');

      if (placeholder) {
        placeholder.classList.toggle('hidden', !!videoEnabled);
      }
      if (wave) {
        wave.classList.toggle('muted', !audioEnabled);
      }
    });

    // Live emoji reactions from peers
    this.socket.on('webrtc-peer-reaction', ({ senderId, reaction }) => {
      this.triggerReactionAnimation(senderId, reaction);
    });
  }

  attachRemoteVideo(peerId, stream) {
    const videoGrid = document.getElementById('video-grid');
    if (!videoGrid) return;

    let card = document.getElementById(`video-card-${peerId}`);
    if (!card) {
      card = document.createElement('div');
      card.id = `video-card-${peerId}`;
      card.className = 'video-tile';
      card.innerHTML = `
        <video id="video-${peerId}" autoplay playsinline></video>
        <div class="video-placeholder hidden">
          <div class="placeholder-avatar" id="avatar-${peerId}"></div>
        </div>
        <div class="video-overlay">
          <span class="user-tag" id="tag-${peerId}">Friend</span>
          <div class="audio-wave">
            <span></span><span></span><span></span>
          </div>
        </div>
      `;
      videoGrid.appendChild(card);
    }

    const videoEl = card.querySelector('video');
    if (videoEl) {
      videoEl.srcObject = stream;
    }
  }

  triggerReactionAnimation(peerId, emoji) {
    const card = (peerId === this.socket.id)
      ? document.getElementById('local-video-card')
      : document.getElementById(`video-card-${peerId}`) || document.getElementById('local-video-card');

    if (!card) return;

    const el = document.createElement('span');
    el.className = 'floating-reaction';
    el.innerText = emoji;
    el.style.left = `${Math.floor(Math.random() * 60 + 20)}%`;
    el.style.bottom = '20px';

    card.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 1800);
  }

  removePeer(peerId) {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
    }
    this.remoteStreams.delete(peerId);
    const card = document.getElementById(`video-card-${peerId}`);
    if (card) {
      card.remove();
    }
  }

  cleanup() {
    this.peers.forEach(pc => pc.close());
    this.peers.clear();
    this.remoteStreams.clear();
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
    }
    clearInterval(this.audioMeterInterval);
  }
}
