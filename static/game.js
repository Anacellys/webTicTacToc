
let socket;
let currentPlayerNumber = null;
let currentRoom = null;
let gameState = null;
let playerScores = {
    x: 0,
    o: 0,
    draw: 0
};
let chatHistory = [];


const lobbyElement = document.getElementById('lobby');
const gameElement = document.getElementById('game');
const playerNameInput = document.getElementById('playerName');
const roomCodeInput = document.getElementById('roomCode');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const roomCodeDisplayGame = document.getElementById('roomCodeDisplayGame');
const shareCodeElement = document.getElementById('shareCode');
const waitingMessage = document.getElementById('waitingMessage');
const playerXName = document.getElementById('playerXName');
const playerOName = document.getElementById('playerOName');
const indicatorX = document.getElementById('indicatorX');
const indicatorO = document.getElementById('indicatorO');
const turnIndicator = document.getElementById('turnIndicator');
const messageElement = document.getElementById('message');
const scoreXElement = document.getElementById('scoreX');
const scoreOElement = document.getElementById('scoreO');
const scoreDrawElement = document.getElementById('scoreDraw');
const winDialogOverlay = document.getElementById('winDialogOverlay');
const winTitle = document.getElementById('winTitle');
const winMessage = document.getElementById('winMessage');
const winnerNameDisplay = document.getElementById('winnerNameDisplay');
const winnerStats = document.getElementById('winnerStats');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');

// Sonidos
const moveSound = document.getElementById('moveSound');
const winSound = document.getElementById('winSound');
const drawSound = document.getElementById('drawSound');



function connectSocket() {
    // Detectar si estamos en producción o desarrollo
    const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    
    // Configurar conexión Socket.IO
    socket = io({
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling']
    });

    // Evento de conexión exitosa
    socket.on('connect', () => {
        console.log('✅ Conectado al servidor con ID:', socket.id);
        showMessage('Conectado al servidor. ¡Listo para jugar!', 'info');
        
        // Intentar reconectar a sala si había un juego en progreso
        const savedRoom = localStorage.getItem('ticTacToe3D_room');
        const savedPlayer = localStorage.getItem('ticTacToe3D_player');
        
        if (savedRoom && savedPlayer !== null) {
            console.log('Intentando reconectar a sala:', savedRoom);
            socket.emit('rejoin_game', {
                room: savedRoom,
                player_number: parseInt(savedPlayer)
            });
        }
        
        // Actualizar estadísticas de conexión
        updateOnlineStats();
    });

    // Error de conexión
    socket.on('connect_error', (error) => {
        console.error('❌ Error de conexión:', error);
        showMessage('Error de conexión al servidor. Intentando reconectar...', 'error');
    });

    // Desconexión
    socket.on('disconnect', (reason) => {
        console.log('🔌 Desconectado:', reason);
        if (reason === 'io server disconnect') {
            showMessage('Desconectado del servidor. Recargando...', 'error');
            setTimeout(() => location.reload(), 3000);
        }
    });

    // ============================================
    // EVENTOS DEL JUEGO
    // ============================================

    // Confirmación de conexión
    socket.on('connected', (data) => {
        console.log('Servidor dice:', data.message);
    });

    // Sala creada exitosamente
    socket.on('game_created', (data) => {
        console.log('🎮 Sala creada:', data);
        
        currentPlayerNumber = 0; // Eres el jugador 1 (X)
        currentRoom = data.room;
        gameState = data.game_state;
        
        // Guardar para posibles reconexiones
        localStorage.setItem('ticTacToe3D_room', currentRoom);
        localStorage.setItem('ticTacToe3D_player', currentPlayerNumber);
        
        // Mostrar pantalla de juego
        showGameScreen();
        
        // Actualizar información de la sala
        roomCodeDisplay.textContent = currentRoom;
        roomCodeDisplayGame.textContent = currentRoom;
        shareCodeElement.textContent = currentRoom;
        
        // Actualizar nombres de jugadores
        playerXName.textContent = data.player_name || 'Jugador 1';
        playerOName.textContent = 'Esperando jugador 2...';
        
        // Mostrar mensaje
        showMessage(`¡Sala creada! Código: ${currentRoom}`, 'info');
        addChatMessage('system', 'Sala creada. Comparte el código con tu amigo.');
        
        // Actualizar interfaz
        updateGameDisplay();
        
        // Mostrar indicador de espera
        if (waitingMessage) {
            waitingMessage.style.display = 'block';
        }
    });

    // Te has unido a una sala
    socket.on('player_joined_self', (data) => {
        console.log('👤 Te uniste a sala:', data);
        
        currentPlayerNumber = data.player_number;
        currentRoom = data.room;
        gameState = data.game_state;
        
        // Guardar para posibles reconexiones
        localStorage.setItem('ticTacToe3D_room', currentRoom);
        localStorage.setItem('ticTacToe3D_player', currentPlayerNumber);
        
        // Mostrar pantalla de juego
        showGameScreen();
        
        // Actualizar información
        roomCodeDisplayGame.textContent = currentRoom;
        
        // Actualizar nombres según quién eres
        if (currentPlayerNumber === 0) {
            playerXName.textContent = 'Jugador 1';
            playerOName.textContent = 'Esperando jugador 2...';
            showMessage('Eres el Jugador 1 (X). Esperando al Jugador 2...', 'info');
        } else {
            playerXName.textContent = 'Jugador 1';
            playerOName.textContent = data.player_name || 'Jugador 2';
            showMessage('¡Te has unido como Jugador 2 (O)!', 'info');
        }
        
        // Agregar mensaje al chat
        addChatMessage('system', `Te has unido a la sala ${currentRoom}`);
        
        // Actualizar interfaz
        updateGameDisplay();
    });

    // Otro jugador se unió a tu sala
    socket.on('player_joined_all', (data) => {
        console.log('👥 Alguien se unió:', data);
        
        // Actualizar el nombre del segundo jugador
        playerOName.textContent = data.player_name || 'Jugador 2';
        
        // Ocultar mensaje de espera
        if (waitingMessage) {
            waitingMessage.style.display = 'none';
        }
        
        // Actualizar estado del juego
        if (data.game_state) {
            gameState = data.game_state;
        }
        
        // Mostrar mensaje según quién eres
        if (currentPlayerNumber === 0) {
            showMessage(`¡${data.player_name} se ha unido! ¡Comienza el juego!`, 'info');
            addChatMessage('system', `${data.player_name} se ha unido al juego!`);
        } else {
            showMessage('¡Conectado! Esperando al primer movimiento...', 'info');
        }
        
        // Actualizar interfaz
        updateGameDisplay();
    });

    // Respuesta de reconexión
    socket.on('rejoin_game_response', (data) => {
        if (data.success) {
            currentRoom = data.room;
            currentPlayerNumber = data.player_number;
            gameState = data.game_state;
            
            showGameScreen();
            roomCodeDisplayGame.textContent = currentRoom;
            
            updateGameDisplay();
            showMessage('¡Reconectado al juego!', 'info');
            addChatMessage('system', 'Reconectado al juego.');
        } else {
            // Limpiar datos guardados si no se pudo reconectar
            localStorage.removeItem('ticTacToe3D_room');
            localStorage.removeItem('ticTacToe3D_player');
            showMessage('No se pudo reconectar. Crea o únete a una nueva sala.', 'error');
        }
    });

    // Jugador desconectado
    socket.on('player_left', (data) => {
        showMessage(`${data.player_name} abandonó el juego`, 'error');
        addChatMessage('system', `${data.player_name} abandonó el juego.`);
        
        // Si eres el único que queda, permitir salir después de un tiempo
        if (currentPlayerNumber !== null) {
            setTimeout(() => {
                showMessage('El otro jugador abandonó. Puedes salir o esperar.', 'info');
            }, 3000);
        }
    });

    // Movimiento realizado
    socket.on('move_made', (data) => {
        console.log('Movimiento realizado:', data);
        
        // Reproducir sonido de movimiento
        playSound(moveSound);
        
        gameState = data.game_state;
        updateGameDisplay();
        
        // Actualizar mensaje según si es tu turno
        if (currentPlayerNumber === data.game_state.current_player) {
            showMessage('¡Tu turno!', 'info');
        }
        
        // Agregar mensaje al chat
        const playerSymbol = data.player === 0 ? 'X' : 'O';
        addChatMessage('player', `Jugador ${playerSymbol} movió en (${data.z+1},${data.y+1},${data.x+1})`);
    });

    // Juego terminado (victoria)
    socket.on('game_over', (data) => {
        console.log('¡Juego terminado! Ganador:', data);
        
        // Reproducir sonido de victoria
        playSound(winSound);
        
        gameState = data.game_state;
        updateGameDisplay();
        
        // Actualizar puntuación
        if (data.winner === 0) {
            playerScores.x++;
            scoreXElement.textContent = playerScores.x;
        } else {
            playerScores.o++;
            scoreOElement.textContent = playerScores.o;
        }
        
        // Mostrar diálogo de victoria
        showWinDialog(data);
        
        // Agregar mensaje al chat
        addChatMessage('system', `¡${data.winner_name} ganó la partida! 🎉`);
        
        // Resaltar celdas ganadoras
        if (data.winning_cells && data.winning_cells.length > 0) {
            highlightWinningCells(data.winning_cells);
        }
    });

    // Empate
    socket.on('game_draw', (data) => {
        console.log('¡Empate!');
        
        // Reproducir sonido de empate
        playSound(drawSound);
        
        gameState = data.game_state;
        updateGameDisplay();
        
        // Actualizar puntuación de empates
        playerScores.draw++;
        scoreDrawElement.textContent = playerScores.draw;
        
        // Mostrar diálogo de empate
        showWinDialog(data, true);
        
        // Agregar mensaje al chat
        addChatMessage('system', '¡La partida terminó en empate! 🤝');
    });

    // Juego reiniciado
    socket.on('game_reset', (data) => {
        console.log('Juego reiniciado');
        
        gameState = data.game_state;
        
        // Remover resaltado de celdas ganadoras
        document.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('winning');
        });
        
        updateGameDisplay();
        showMessage(data.message || 'Juego reiniciado', 'info');
        addChatMessage('system', 'El juego ha sido reiniciado.');
        
        // Ocultar diálogo de victoria si está visible
        winDialogOverlay.classList.add('hidden');
    });

    // Error del servidor
    socket.on('error', (data) => {
        showMessage(data.message, 'error');
    });

    // Jugador reconectado
    socket.on('player_reconnected', (data) => {
        showMessage('El otro jugador se reconectó', 'info');
        addChatMessage('system', 'El otro jugador se reconectó.');
    });

    // Mensaje de chat
    socket.on('chat_message', (data) => {
        addChatMessage('player', data.message, data.player_name);
    });
}

// ============================================
// FUNCIONES DEL JUEGO
// ============================================

// Crear una nueva sala
function createGame() {
    const playerName = playerNameInput.value.trim() || 'Jugador';
    if (playerName.length < 2) {
        showMessage('El nombre debe tener al menos 2 caracteres', 'error');
        return;
    }
    
    if (socket && socket.connected) {
        socket.emit('create_game', { player_name: playerName });
    } else {
        showMessage('Conectando al servidor...', 'info');
        setTimeout(() => createGame(), 1000);
    }
}

// Crear juego rápido (con nombre por defecto)
function quickCreateGame() {
    const name = playerNameInput.value.trim() || 'Jugador_' + Math.floor(Math.random() * 1000);
    playerNameInput.value = name;
    createGame();
}

// Unirse a una sala existente
function joinGame() {
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    const playerName = playerNameInput.value.trim() || 'Jugador';
    
    if (roomCode.length !== 6) {
        showMessage('El código debe tener exactamente 6 caracteres', 'error');
        return;
    }
    
    if (playerName.length < 2) {
        showMessage('El nombre debe tener al menos 2 caracteres', 'error');
        return;
    }
    
    if (socket && socket.connected) {
        socket.emit('join_game', {
            room: roomCode,
            player_name: playerName
        });
    } else {
        showMessage('Conectando al servidor...', 'info');
        setTimeout(() => joinGame(), 1000);
    }
}

// Mostrar formulario para unirse
function showJoinForm() {
    document.getElementById('joinSection').style.display = 'flex';
    roomCodeInput.focus();
}

// Manejar clic en una celda
function cellClick(z, y, x) {
    if (!gameState || gameState.game_over) {
        showMessage('El juego ha terminado', 'error');
        return;
    }
    
    if (currentPlayerNumber !== gameState.current_player) {
        showMessage('No es tu turno', 'error');
        return;
    }
    
    if (socket && currentRoom) {
        socket.emit('make_move', {
            z: z,
            y: y,
            x: x
        });
    }
}

// Actualizar la pantalla del juego
function updateGameDisplay() {
    if (!gameState) return;
    
    // Actualizar información de jugadores
    if (gameState.players && gameState.players.length > 0) {
        const player1 = gameState.players.find(p => p.number === 0);
        const player2 = gameState.players.find(p => p.number === 1);
        
        if (player1) {
            playerXName.textContent = player1.name || 'Jugador 1';
        }
        if (player2) {
            playerOName.textContent = player2.name || 'Jugador 2';
        }
    }
    
    // Actualizar indicadores de turno
    const isPlayerXTurn = gameState.current_player === 0;
    const isPlayerOTurn = gameState.current_player === 1;
    
    document.getElementById('playerX').classList.toggle('active', isPlayerXTurn);
    document.getElementById('playerO').classList.toggle('active', isPlayerOTurn);
    
    indicatorX.style.visibility = isPlayerXTurn ? 'visible' : 'hidden';
    indicatorO.style.visibility = isPlayerOTurn ? 'visible' : 'hidden';
    
    // Actualizar mensaje de turno
    if (gameState.game_over) {
        turnIndicator.textContent = 'Juego terminado';
    } else {
        const playerText = gameState.current_player === 0 ? 'Jugador 1 (X)' : 'Jugador 2 (O)';
        const yourTurn = gameState.current_player === currentPlayerNumber ? '¡Tu turno!' : 'Turno del oponente';
        turnIndicator.textContent = `${yourTurn} - ${playerText}`;
    }
    
    // Renderizar tablero
    renderGameBoard();
}

// Renderizar el tablero de juego
function renderGameBoard() {
    if (!gameState) return;
    
    const layersContainer = document.querySelector('.layers-container');
    if (!layersContainer) return;
    
    layersContainer.innerHTML = '';
    
    for (let z = 0; z < 4; z++) {
        const layerDiv = document.createElement('div');
        layerDiv.className = 'layer';
        layerDiv.innerHTML = `<h3><i class="fas fa-layer-group"></i> Capa ${z + 1}</h3>`;
        
        const boardDiv = document.createElement('div');
        boardDiv.className = 'board';
        
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.z = z;
                cell.dataset.y = y;
                cell.dataset.x = x;
                
                const value = gameState.board[z][y][x];
                if (value === -1) {
                    cell.textContent = 'X';
                    cell.classList.add('x');
                    cell.classList.add('occupied');
                } else if (value === 1) {
                    cell.textContent = 'O';
                    cell.classList.add('o');
                    cell.classList.add('occupied');
                }
                
                // Permitir clic solo si está vacío y es tu turno
                if (value === 0 && !gameState.game_over && gameState.current_player === currentPlayerNumber) {
                    cell.style.cursor = 'pointer';
                    cell.onclick = () => cellClick(z, y, x);
                } else {
                    cell.style.cursor = 'default';
                }
                
                boardDiv.appendChild(cell);
            }
        }
        
        layerDiv.appendChild(boardDiv);
        layersContainer.appendChild(layerDiv);
    }
}

// Reiniciar el juego actual
function resetCurrentGame() {
    if (socket && currentRoom) {
        socket.emit('reset_game');
        
        // Ocultar diálogo de victoria
        winDialogOverlay.classList.add('hidden');
        
        showMessage('Solicitando reinicio del juego...', 'info');
    }
}

// Salir del juego
function leaveGame() {
    // Limpiar datos guardados
    localStorage.removeItem('ticTacToe3D_room');
    localStorage.removeItem('ticTacToe3D_player');
    
    // Resetear variables
    currentPlayerNumber = null;
    currentRoom = null;
    gameState = null;
    
    // Mostrar pantalla de inicio
    lobbyElement.classList.remove('hidden');
    gameElement.classList.add('hidden');
    winDialogOverlay.classList.add('hidden');
    
    // Limpiar campos
    roomCodeInput.value = '';
    
    showMessage('Has salido de la sala', 'info');
    
    // Desconectar socket si es necesario
    if (socket) {
        socket.disconnect();
    }
}

// Mostrar pantalla de juego
function showGameScreen() {
    lobbyElement.classList.add('hidden');
    gameElement.classList.remove('hidden');
    winDialogOverlay.classList.add('hidden');
}

// ============================================
// FUNCIONES DE INTERFAZ
// ============================================

// Mostrar mensaje temporal
function showMessage(text, type = 'info') {
    if (!messageElement) return;
    
    messageElement.textContent = text;
    messageElement.className = `message ${type}`;
    
    // Auto-ocultar mensajes que no son errores
    if (type !== 'error') {
        setTimeout(() => {
            messageElement.textContent = '';
            messageElement.className = 'message';
        }, 4000);
    }
}

// Mostrar diálogo de victoria/empate
function showWinDialog(data, isDraw = false) {
    if (!winDialogOverlay || !winTitle || !winMessage) return;
    
    if (isDraw) {
        winTitle.textContent = '¡EMPATE!';
        winMessage.textContent = data.message || '¡Ningún jugador gana!';
        winnerNameDisplay.textContent = 'Empate';
        winnerStats.textContent = 'Ambos jugadores igualaron';
    } else {
        winTitle.textContent = '¡FELICIDADES!';
        winMessage.textContent = data.message || '¡Tenemos un ganador!';
        
        const winnerName = data.winner_name || (data.winner === 0 ? 'Jugador X' : 'Jugador O');
        winnerNameDisplay.textContent = winnerName;
        
        const isYou = currentPlayerNumber === data.winner;
        winnerStats.textContent = isYou ? '¡Ganaste esta partida!' : '¡Ganó esta partida!';
    }
    
    // Generar confeti
    generateConfetti();
    
    // Mostrar diálogo
    winDialogOverlay.classList.remove('hidden');
}

// Resaltar celdas ganadoras
function highlightWinningCells(winningCells) {
    if (!winningCells || !winningCells.length) return;
    
    setTimeout(() => {
        winningCells.forEach(([z, y, x]) => {
            const cells = document.querySelectorAll('.cell');
            const cellIndex = (z * 16) + (y * 4) + x;
            if (cells[cellIndex]) {
                cells[cellIndex].classList.add('winning');
            }
        });
    }, 500);
}

// Generar efecto de confeti
function generateConfetti() {
    const confettiContainer = document.querySelector('.confetti-container');
    if (!confettiContainer) return;
    
    confettiContainer.innerHTML = '';
    
    for (let i = 0; i < 20; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
        confetti.style.animationDelay = (Math.random() * 2) + 's';
        confetti.style.backgroundColor = getRandomColor();
        confettiContainer.appendChild(confetti);
    }
}

// Obtener color aleatorio para confeti
function getRandomColor() {
    const colors = ['#FFD700', '#FFA500', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Reproducir sonido
function playSound(audioElement) {
    if (audioElement) {
        audioElement.currentTime = 0;
        audioElement.play().catch(e => console.log('Error reproduciendo sonido:', e));
    }
}

// ============================================
// FUNCIONES DE CHAT
// ============================================

// Enviar mensaje de chat
function sendChatMessage() {
    const message = chatInput.value.trim();
    
    if (!message) return;
    
    if (socket && currentRoom) {
        socket.emit('chat_message', {
            message: message,
            room: currentRoom
        });
        
        // Agregar mensaje localmente (se actualizará cuando llegue del servidor)
        addChatMessage('self', message);
        chatInput.value = '';
    }
}

// Agregar mensaje al chat
function addChatMessage(type, text, sender = null) {
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-time';
    timeSpan.textContent = getCurrentTime();
    
    const textSpan = document.createElement('span');
    textSpan.className = 'chat-text';
    
    if (type === 'player' && sender) {
        textSpan.textContent = `${sender}: ${text}`;
    } else if (type === 'self') {
        textSpan.textContent = `Tú: ${text}`;
    } else {
        textSpan.textContent = text;
    }
    
    messageDiv.appendChild(timeSpan);
    messageDiv.appendChild(textSpan);
    chatMessages.appendChild(messageDiv);
    
    // Auto-scroll al último mensaje
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Limitar historial de chat
    chatHistory.push({ type, text, sender, time: getCurrentTime() });
    if (chatHistory.length > 50) {
        chatHistory.shift();
    }
}

// Obtener hora actual formateada
function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

// ============================================
// FUNCIONES UTILITARIAS
// ============================================

// Copiar código de sala al portapapeles
function copyRoomCode() {
    const code = shareCodeElement.textContent;
    if (code) {
        navigator.clipboard.writeText(code).then(() => {
            showMessage('Código copiado al portapapeles', 'info');
        }).catch(err => {
            console.error('Error copiando código:', err);
            showMessage('Error al copiar código', 'error');
        });
    }
}

// Copiar enlace del juego
function copyGameLink() {
    const link = window.location.href;
    navigator.clipboard.writeText(link).then(() => {
        showMessage('Enlace del juego copiado', 'info');
    });
}

// Compartir en WhatsApp
function shareOnWhatsApp() {
    const text = `¡Juega Tic Tac Toe 3D conmigo! Juego online multijugador. ${window.location.href}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

// Compartir en Telegram
function shareOnTelegram() {
    const text = `¡Juega Tic Tac Toe 3D conmigo! ${window.location.href}`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent('¡Juega Tic Tac Toe 3D conmigo!')}`;
    window.open(url, '_blank');
}

// Compartir victoria
function shareVictory() {
    const winnerName = winnerNameDisplay.textContent;
    const text = `¡Acabo de ${winnerName === 'Empate' ? 'empatar' : 'ganar'} en Tic Tac Toe 3D! Juega conmigo: ${window.location.href}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Tic Tac Toe 3D Online',
            text: text,
            url: window.location.href
        });
    } else {
        navigator.clipboard.writeText(text).then(() => {
            showMessage('Mensaje copiado. ¡Compártelo!', 'info');
        });
    }
}

// Mostrar instrucciones del juego
function showGameInstructions() {
    const modal = document.getElementById('instructionsModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

// Cerrar instrucciones
function closeInstructions() {
    const modal = document.getElementById('instructionsModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Actualizar estadísticas online (simuladas)
function updateOnlineStats() {
    // En producción, esto vendría del servidor
    document.getElementById('onlinePlayers').textContent = Math.floor(Math.random() * 50) + 10;
    document.getElementById('activeGames').textContent = Math.floor(Math.random() * 20) + 5;
    document.getElementById('totalGames').textContent = Math.floor(Math.random() * 1000) + 500;
}

// ============================================
// INICIALIZACIÓN
// ============================================

// Inicializar cuando se carga la página
window.onload = function() {
    // Conectar al servidor
    connectSocket();
    
    // Configurar eventos de teclado
    setupKeyboardEvents();
    
    // Actualizar estadísticas
    updateOnlineStats();
    setInterval(updateOnlineStats, 30000);
    
    // Mostrar mensaje de bienvenida
    setTimeout(() => {
        if (!gameElement.classList.contains('hidden')) {
            showMessage('¡Bienvenido a Tic Tac Toe 3D Online!', 'info');
        }
    }, 1500);
};

// Configurar eventos de teclado
function setupKeyboardEvents() {
    // Enter para crear sala
    playerNameInput?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            createGame();
        }
    });
    
    // Enter para unirse a sala
    roomCodeInput?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            joinGame();
        }
    });
    
    // Enter para enviar mensaje de chat
    chatInput?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    
    // Escape para cerrar modales
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeInstructions();
            winDialogOverlay.classList.add('hidden');
        }
    });
}

// Detectar dispositivo móvil
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Inicializar ajustes para móvil
if (isMobileDevice()) {
    document.body.classList.add('mobile-device');
}