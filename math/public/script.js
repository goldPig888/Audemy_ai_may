let recognition;
let isRecognizing = false;
let lastAudioPath = '';
let currentAnswer = null;
let isPlayingFeedback = false;
let isProcessingRound = false;
let isGameRunning = false;
let gameMode = '';

let totalGamesPlayed = 0;
let correctAnswers = 0;

document.addEventListener('DOMContentLoaded', function () {
    gameMode = document.body.dataset.gameMode;
    console.log('Game mode:', gameMode);

    loadGameStatsFromCookies(); 
});

document.getElementById('startGameBtn').addEventListener('click', () => {
    if (isGameRunning) {
        endGame();
    } else {
        startGameRound();
    }
});

async function startGameRound() {
    const audioPlayer = document.getElementById('audioPlayer');
    const startButton = document.getElementById('startGameBtn');

    if (isPlayingFeedback || isProcessingRound) {
        console.log('Waiting for feedback or round processing...');
        return;
    }

    try {
        isProcessingRound = true;
        isGameRunning = true;
        startButton.textContent = 'End Game';

        const gameMode = document.body.dataset.gameMode;
        const url = `/start-game/${gameMode}`;
        console.log('Requesting game start for mode:', gameMode);

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to start the game');

        const { question, answer, audioPath } = await response.json();
        console.log('Received question:', question);
        console.log('Received audio path:', audioPath);

        currentAnswer = answer;
        lastAudioPath = audioPath;

        audioPlayer.src = audioPath;
        console.log('Playing question audio from:', audioPlayer.src);
        await playAudio(audioPlayer);

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);

        isProcessingRound = false;
    } catch (error) {
        console.error('Error during the game:', error);
        alert('An error occurred, please try again.');
    }
}

function handleKeyDown(event) {
    if (event.code === 'Space' && !isRecognizing) {
        startSpeechRecognition();
    } else if (event.code === 'KeyR') {
        repeatLastAudio();
    }
}

function handleKeyUp(event) {
    if (event.code === 'Space' && isRecognizing) {
        stopSpeechRecognition();
    }
}

function startSpeechRecognition() {
    if (isRecognizing) return;

    recognition = new webkitSpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.start();
    isRecognizing = true;

    console.log('Speech recognition started...');

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('User said:', transcript);
        recognition.userAnswer = transcript;
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
    };

    recognition.onend = () => {
        console.log('Speech recognition ended');
        isRecognizing = false;
    };
}

async function stopSpeechRecognition() {
    if (recognition) {
        recognition.stop();
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    const userAnswer = recognition.userAnswer || '';
    if (!userAnswer.trim()) {
        console.error('No valid user answer detected.');
        await playNoInputDetectedAudio();
        retryRound();
        return;
    }

    console.log('Submitting userAnswer:', userAnswer);
    console.log('Submitting correctAnswer:', currentAnswer);

    try {
        const resultResponse = await fetch('/submit-answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audioBytes: userAnswer.trim(),
                correctAnswer: currentAnswer,
                gameMode: gameMode
            })
        });

        if (!resultResponse.ok) throw new Error('Failed to submit answer');
        const { feedback, feedbackAudioPath, accuracy, totalGamesPlayed: newTotalGames, correctAnswers: newCorrectAnswers } = await resultResponse.json();

        totalGamesPlayed = newTotalGames; 
        correctAnswers = newCorrectAnswers;

        console.log(`Accuracy: ${accuracy}%`);
        console.log(`Total Games Played: ${totalGamesPlayed}`);
        console.log(`Correct Answers: ${correctAnswers}`);

        isPlayingFeedback = true;
        lastAudioPath = feedbackAudioPath;
        const audioPlayer = document.getElementById('audioPlayer');
        audioPlayer.src = feedbackAudioPath;
        console.log('Playing feedback audio from:', feedbackAudioPath);

        await playAudio(audioPlayer);
        isPlayingFeedback = false;

        saveGameStatsToCookies();

        if (isGameRunning) {
            setTimeout(startGameRound, 1000);
        }
    } catch (error) {
        console.error('Error submitting answer:', error);
    }
}

function retryRound() {
    console.log('Retrying round. Waiting for valid input...');
    const audioPlayer = document.getElementById('audioPlayer');
    audioPlayer.src = lastAudioPath;
    playAudio(audioPlayer);

    document.addEventListener('keydown', handleKeyDown);
}

async function repeatLastAudio() {
    if (!lastAudioPath) return;

    const response = await fetch('/repeat-audio');
    if (!response.ok) {
        console.error('Failed to repeat audio');
        return;
    }

    const { audioPath } = await response.json();
    const audioPlayer = document.getElementById('audioPlayer');
    audioPlayer.src = audioPath;
    await playAudio(audioPlayer);
}

async function playNoInputDetectedAudio() {
    try {
        const response = await fetch('/no-input-audio');
        if (!response.ok) throw new Error('Failed to get no input audio');

        const { noInputAudioPath } = await response.json();
        const audioPlayer = document.getElementById('audioPlayer');
        audioPlayer.src = noInputAudioPath;
        await playAudio(audioPlayer);
    } catch (error) {
        console.error('Error playing "I didn\'t get that" audio:', error);
    }
}

function playAudio(audioElement) {
    return new Promise((resolve, reject) => {
        audioElement.onended = resolve;
        audioElement.onerror = (error) => {
            console.error('Audio playback error:', error);
            reject(error);
        };
        audioElement.play().catch(reject);
    });
}

function endGame() {
    const startButton = document.getElementById('startGameBtn');
    isGameRunning = false;
    startButton.textContent = 'Start Game';

    fetch(`/end-game?gameMode=${gameMode}&currentQuestionCounted=${isProcessingRound}`)
        .then(response => response.json())
        .then(data => {
            console.log('Game ended. Results:', data);
            //alert(`Game over! Total games played: ${data.totalGamesPlayed}, Correct answers: ${data.correctAnswers}, Accuracy: ${data.accuracy}%`);

            saveGameStatsToCookies(data);
        })
        .catch(error => {
            console.error('Error ending the game:', error);
        });
}

function getCookieValue(cookieName) {
    const cookies = document.cookie.split('; ');
    for (let cookie of cookies) {
        const [name, value] = cookie.split('=');
        if (name === cookieName) {
            return decodeURIComponent(value);
        }
    }
    return null;
}

function loadGameStatsFromCookies() {
    const savedTotalGames = getCookieValue(`${gameMode}_totalGames`);
    const savedCorrectAnswers = getCookieValue(`${gameMode}_correctAnswers`);

    if (savedTotalGames !== null && savedCorrectAnswers !== null) {
        totalGamesPlayed = parseInt(savedTotalGames, 10) || 0;
        correctAnswers = parseInt(savedCorrectAnswers, 10) || 0;
        console.log(`Loaded stats from cookies for ${gameMode}: Total Games: ${totalGamesPlayed}, Correct Answers: ${correctAnswers}`);
    } else {
        console.log('No saved stats found, starting fresh.');
    }
}

function saveGameStatsToCookies() {
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);  // Set expiry to 1 year

    document.cookie = `${gameMode}_totalGames=${totalGamesPlayed}; expires=${expiryDate.toUTCString()}; path=/`;
    document.cookie = `${gameMode}_correctAnswers=${correctAnswers}; expires=${expiryDate.toUTCString()}; path=/`;

    console.log(`${gameMode} stats saved to cookies.`);
}
