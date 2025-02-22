from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
socketio = SocketIO(app, cors_allowed_origins="*")

rooms = {}

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    print('Client connected:', request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected:', request.sid)

@socketio.on('create')
def on_create(data):
    room_id = data['room_id']
    print(f"Creating room: {room_id}")
    rooms[room_id] = {'users': []}
    join_room(room_id)
    rooms[room_id]['users'].append(request.sid)
    emit('room_created', {'room_id': room_id}, room=room_id)

@socketio.on('join')
def on_join(data):
    room_id = data['room_id']
    print(f"Joining room: {room_id}")
    if room_id in rooms:
        join_room(room_id)
        rooms[room_id]['users'].append(request.sid)
        emit('room_joined', {'room_id': room_id}, room=room_id)
        if len(rooms[room_id]['users']) == 2:
            emit('start_call', room=room_id, to=rooms[room_id]['users'][1])
    else:
        emit('error', {'msg': 'Room does not exist'})

@socketio.on('offer')
def on_offer(data):
    room_id = data['room_id']
    emit('offer', data['offer'], room=room_id, skip_sid=request.sid)

@socketio.on('answer')
def on_answer(data):
    room_id = data['room_id']
    emit('answer', data['answer'], room=room_id, skip_sid=request.sid)

@socketio.on('ice-candidate')
def on_ice_candidate(data):
    room_id = data['room_id']
    emit('ice-candidate', data['candidate'], room=room_id, skip_sid=request.sid)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)