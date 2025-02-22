const socket = io('http://192.168.0.111:5000', { transports: ['websocket', 'polling'] });
let pc;
const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let iceCandidateQueue = [];

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const status = document.getElementById('status');

// SocketIO debugging
socket.on('connect', () => {
    console.log('Connected to SocketIO server');
});
socket.on('connect_error', (error) => {
    console.log('SocketIO connection error:', error);
    status.textContent = 'Failed to connect to server.';
});
socket.on('disconnect', () => {
    console.log('Disconnected from SocketIO server');
});

// WebRTC setup
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.textContent = 'WebRTC not supported.';
} else {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            localVideo.srcObject = stream;
            window.localStream = stream;
            status.textContent = 'Local video stream started.';
        })
        .catch(err => {
            console.error('Error accessing media devices:', err);
            status.textContent = `Failed to access camera/microphone: ${err.message}`;
        });
}

function createRoom() {
    const roomId = document.getElementById('room-id').value;
    if (!roomId) {
        status.textContent = 'Please enter a room ID.';
        return;
    }
    console.log('Creating room:', roomId);
    socket.emit('create', { room_id: roomId });
    console.log('Emitted create event for room:', roomId);
}

function joinRoom() {
    const roomId = document.getElementById('room-id').value;
    if (!roomId) {
        status.textContent = 'Please enter a room ID.';
        return;
    }
    console.log('Joining room:', roomId);
    socket.emit('join', { room_id: roomId });
}

socket.on('room_created', (data) => {
    console.log('Room created:', data.room_id);
    status.textContent = `Room ${data.room_id} created. Waiting for participant...`;
    // Initialize RTCPeerConnection for creator
    pc = new RTCPeerConnection(configuration);
    setupPeerConnection(pc);
    window.localStream.getTracks().forEach(track => pc.addTrack(track, window.localStream));
});

socket.on('room_joined', (data) => {
    console.log('Room joined:', data.room_id);
    status.textContent = `Joined room ${data.room_id}.`;
});

socket.on('start_call', () => {
    console.log('Starting call (joiner)');
    pc = new RTCPeerConnection(configuration);
    setupPeerConnection(pc);
    window.localStream.getTracks().forEach(track => pc.addTrack(track, window.localStream));
    pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
            console.log('Sending offer:', pc.localDescription);
            socket.emit('offer', { room_id: document.getElementById('room-id').value, offer: pc.localDescription });
        })
        .catch(err => console.error('Error creating offer:', err));
});

socket.on('offer', (offer) => {
    if (!offer || !offer.type) {
        console.error('Invalid offer received:', offer);
        status.textContent = 'Received invalid offer.';
        return;
    }
    console.log('Received offer:', offer);
    if (!pc) {
        pc = new RTCPeerConnection(configuration);
        setupPeerConnection(pc);
        window.localStream.getTracks().forEach(track => pc.addTrack(track, window.localStream));
    }
    pc.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => {
            if (pc.signalingState === 'have-remote-offer') {
                return pc.createAnswer();
            }
        })
        .then(answer => {
            if (answer) {
                return pc.setLocalDescription(answer);
            }
        })
        .then(() => {
            if (pc.localDescription) {
                console.log('Sending answer:', pc.localDescription);
                socket.emit('answer', { room_id: document.getElementById('room-id').value, answer: pc.localDescription });
            }
        })
        .catch(err => console.error('Error handling offer:', err));
});

socket.on('answer', (answer) => {
    if (!answer || !answer.type) {
        console.error('Invalid answer received:', answer);
        status.textContent = 'Received invalid answer.';
        return;
    }
    console.log('Received answer:', answer);
    if (pc && pc.signalingState === 'have-local-offer') {
        pc.setRemoteDescription(new RTCSessionDescription(answer))
            .catch(err => console.error('Error setting remote answer:', err));
    } else {
        console.error('Invalid state for answer:', pc ? pc.signalingState : 'no pc');
    }
});

socket.on('ice-candidate', (candidate) => {
    if (!candidate) {
        console.error('Invalid ICE candidate received:', candidate);
        return;
    }
    console.log('Received ICE candidate:', candidate);
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(err => console.error('Error adding ICE candidate:', err));
    } else {
        console.log('Queuing ICE candidate');
        iceCandidateQueue.push(candidate);
    }
});

function setupPeerConnection(pc) {
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Sending ICE candidate:', event.candidate);
            socket.emit('ice-candidate', { room_id: document.getElementById('room-id').value, candidate: event.candidate });
        }
    };
    pc.ontrack = (event) => {
        console.log('Received remote stream');
        if (!remoteVideo.srcObject) { // Prevent overwriting
            remoteVideo.srcObject = event.streams[0];
        }
    };
    pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected') {
            status.textContent = 'Call connected!';
        }
    };
    pc.onsignalingstatechange = () => {
        console.log('Signaling state:', pc.signalingState);
        if (pc.signalingState === 'stable' && iceCandidateQueue.length > 0) {
            iceCandidateQueue.forEach(candidate => {
                pc.addIceCandidate(new RTCIceCandidate(candidate))
                    .catch(err => console.error('Error adding queued ICE candidate:', err));
            });
            iceCandidateQueue = [];
        }
    };
}