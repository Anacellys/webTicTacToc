from flask import Flask, render_template, session, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import random
import json
import os
import time

import eventlet
eventlet.monkey_patch()



app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 's')
app.config['SESSION_TYPE'] = 'filesystem'

# Configuración de SocketIO para producción
socketio = SocketIO(
    app, 
    cors_allowed_origins="*",
    async_mode='eventlet',
    logger=True,
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=25
)

# Almacenar juegos activos (en producción usaríamos Redis)
games = {}
players = {}

class Game:
    def __init__(self, room):
        self.room = room
        self.board = [[[0 for _ in range(4)] for _ in range(4)] for _ in range(4)]
        self.players = []
        self.current_player = 0
        self.winner = None
        self.game_over = False
        self.winning_cells = []
        self.created_at = time.time()

        
    def make_move(self, z, y, x, player):
        if self.game_over or player != self.current_player:
            return False
            
        if self.board[z][y][x] != 0:
            return False
            
        self.board[z][y][x] = -1 if player == 0 else 1
        
        win_result = self.check_win(z, y, x)
        if win_result:
            self.winner = player
            self.game_over = True
            self.winning_cells = win_result
            return "win"
        
        if self.is_board_full():
            self.game_over = True
            return "draw"
        
        self.current_player = 1 - player
        return "continue"
    
    def check_win(self, z, y, x):
        C = [
            [1, 1, 0], [1, 0, 1], [0, 1, 1],
            [1, 0, 0], [1, -1, 0], [0, 0, 1],
            [-1, 0, 1], [0, 1, 0], [0, 1, -1],
            [0, -1, -1], [0, -1, 0], [0, 0, -1],
            [0, 0, 0]
        ]
        
        player_value = self.board[z][y][x]
        
        for direction in C:
            tz, ty, tx = direction
            count = 0
            cells = []
            
            for i in range(4):
                if tz == 1:
                    cz = z
                elif tz == 0:
                    cz = i
                else:
                    cz = 3 - i
                    
                if ty == 1:
                    cy = y
                elif ty == 0:
                    cy = i
                else:
                    cy = 3 - i
                    
                if tx == 1:
                    cx = x
                elif tx == 0:
                    cx = i
                else:
                    cx = 3 - i
                
                if 0 <= cz < 4 and 0 <= cy < 4 and 0 <= cx < 4:
                    if self.board[cz][cy][cx] == player_value:
                        count += 1
                        cells.append((cz, cy, cx))
                    else:
                        break
            
            if count == 4:
                return cells
        
        return None
    
    def is_board_full(self):
        for z in range(4):
            for y in range(4):
                for x in range(4):
                    if self.board[z][y][x] == 0:
                        return False
        return True
    
    def reset(self):
        self.board = [[[0 for _ in range(4)] for _ in range(4)] for _ in range(4)]
        self.current_player = 0
        self.winner = None
        self.game_over = False
        self.winning_cells = []
        
    def get_state(self):
        return {
            'board': self.board,
            'current_player': self.current_player,
            'players': self.players,
            'winner': self.winner,
            'game_over': self.game_over,
            'winning_cells': self.winning_cells
        }

# Limpiar juegos viejos (cada hora)
def cleanup_old_games():
    import time
    current_time = time.time()
    rooms_to_delete = []
    
    for room, game in games.items():
        # Eliminar juegos con más de 2 horas sin actividad
        if current_time - game.created_at > 7200:  # 2 horas en segundos
            rooms_to_delete.append(room)
    
    for room in rooms_to_delete:
        del games[room]

@app.route('/')
def index():
    cleanup_old_games()  # Limpiar juegos viejos
    return render_template('index.html')

@app.route('/health')
def health_check():
    return {'status': 'ok', 'games_active': len(games)}, 200

@socketio.on('connect')
def handle_connect():
    print(f'Cliente conectado desde: {request.remote_addr}')
    emit('connected', {'message': 'Conectado al servidor'})

@socketio.on('rejoin_game')
def handle_rejoin_game(data):
    room = data.get('room')
    player_number = data.get('player_number')
    
    if room not in games:
        emit('rejoin_game_response', {'success': False, 'message': 'Sala no existe'})
        return
    
    game = games[room]
    
    player_exists = False
    for player in game.players:
        if player['number'] == player_number:
            player_exists = True
            player['sid'] = request.sid
            break
    
    if not player_exists:
        emit('rejoin_game_response', {'success': False, 'message': 'Jugador no encontrado'})
        return
    
    join_room(room)
    players[request.sid] = {
        'sid': request.sid,
        'room': room,
        'player_number': player_number
    }
    
    emit('rejoin_game_response', {
        'success': True,
        'room': room,
        'player_number': player_number,
        'game_state': game.get_state()
    })
    
    emit('player_reconnected', {
        'player_number': player_number
    }, room=room, include_self=False)

@socketio.on('create_game')
def handle_create_game(data):
    player_name = data.get('player_name', 'Jugador')[:20]  # Limitar longitud
    room = ''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=6))
    
    # Evitar colisiones (muy raro, pero por si acaso)
    while room in games:
        room = ''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=6))
    
    games[room] = Game(room)
    players[request.sid] = {
        'sid': request.sid,
        'name': player_name,
        'room': room,
        'player_number': 0
    }
    
    games[room].players.append({
        'sid': request.sid,
        'name': player_name,
        'number': 0
    })
    
    join_room(room)
    
    emit('game_created', {
        'room': room,
        'player_number': 0,
        'game_state': games[room].get_state(),
        'player_name': player_name
    })
    
    print(f'Juego creado: {room} por {player_name}')

@socketio.on('join_game')
def handle_join_game(data):
    room = data.get('room', '').upper()[:6]
    player_name = data.get('player_name', 'Jugador')[:20]
    
    if room not in games:
        emit('error', {'message': 'Sala no encontrada'})
        return
    
    game = games[room]
    
    if len(game.players) >= 2:
        emit('error', {'message': 'La sala está llena'})
        return
    
    player_number = 1
    
    players[request.sid] = {
        'sid': request.sid,
        'name': player_name,
        'room': room,
        'player_number': player_number
    }
    
    game.players.append({
        'sid': request.sid,
        'name': player_name,
        'number': player_number
    })
    
    join_room(room)
    
    emit('player_joined_self', {
        'player_name': player_name,
        'player_number': player_number,
        'game_state': game.get_state(),
        'room': room
    })
    
    emit('player_joined_all', {
        'player_name': player_name,
        'player_number': player_number,
        'game_state': game.get_state()
    }, room=room, include_self=False)
    
    print(f'Jugador {player_name} se unió a la sala {room}')

@socketio.on('make_move')
def handle_make_move(data):
    player_info = players.get(request.sid)
    if not player_info:
        return
    
    room = player_info['room']
    if room not in games:
        return
    
    game = games[room]
    player_number = player_info['player_number']
    
    z = data['z']
    y = data['y']
    x = data['x']
    
    result = game.make_move(z, y, x, player_number)
    
    if result:
        game_state = game.get_state()
        
        if result == "win":
            winner_message = f"¡FELICIDADES {player_info['name']}! ¡GANASTE! 🎉"
            if player_number == 0:
                winner_message = f"¡FELICIDADES {player_info['name']}! (X) ¡GANASTE! 🏆"
            else:
                winner_message = f"¡FELICIDADES {player_info['name']}! (O) ¡GANASTE! ⭐"
            
            emit('game_over', {
                'winner': player_number,
                'winner_name': player_info['name'],
                'game_state': game_state,
                'winning_cells': game.winning_cells,
                'message': winner_message,
                'is_draw': False
            }, room=room)
            
        elif result == "draw":
            emit('game_draw', {
                'game_state': game_state,
                'message': '¡EMPATE! ¡Ningún jugador gana! 🤝',
                'is_draw': True
            }, room=room)
            
        else:
            emit('move_made', {
                'z': z,
                'y': y,
                'x': x,
                'player': player_number,
                'game_state': game_state
            }, room=room)

@socketio.on('reset_game')
def handle_reset_game():
    player_info = players.get(request.sid)
    if not player_info:
        return
    
    room = player_info['room']
    if room not in games:
        return
    
    game = games[room]
    
    if not game.game_over:
        emit('error', {'message': 'El juego aún no ha terminado'})
        return
    
    game.reset()
    
    emit('game_reset', {
        'game_state': game.get_state(),
        'message': '¡Juego reiniciado! Empieza el Jugador 1 (X)'
    }, room=room)
    
    print(f'Juego reiniciado en sala {room}')

@socketio.on('disconnect')
def handle_disconnect():
    player_info = players.get(request.sid)
    if player_info:
        room = player_info['room']
        if room in games:
            leave_room(room)
            emit('player_left', {
                'player_name': player_info['name'],
                'player_number': player_info.get('player_number')
            }, room=room)
            
            games[room].players = [p for p in games[room].players if p['sid'] != request.sid]
            if len(games[room].players) == 0:
                del games[room]
        
        del players[request.sid]

# Manejo de errores
@socketio.on_error()
def error_handler(e):
    print(f'Error de SocketIO: {e}')

@app.errorhandler(404)
def not_found(error):
    return render_template('404.html'), 404

@app.errorhandler(500)
def internal_error(error):
    return render_template('500.html'), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    print(f"Servidor Tic Tac Toe 3D iniciando...")
    print(f"Modo: {'Desarrollo' if debug else 'Producción'}")
    print(f"Puerto: {port}")
    print(f"URL: http://localhost:{port}")
    print(f"Juegos activos: {len(games)}")
    
    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        debug=debug
    )