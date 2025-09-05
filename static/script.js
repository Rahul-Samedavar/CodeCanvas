document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const promptInput = document.getElementById('prompt-input');
    const generateBtn = document.getElementById('generate-btn');
    const modificationInput = document.getElementById('modification-input');
    const modifyBtn = document.getElementById('modify-btn');
    const downloadBtn = document.getElementById('download-btn');
    const openTabBtn = document.getElementById('open-tab-btn');
    const copyCodeBtn = document.getElementById('copy-code-btn'); // NEW

    const togglePreviewBtn = document.getElementById('toggle-preview-btn');
    const toggleCodeBtn = document.getElementById('toggle-code-btn');
    const refreshPreviewBtn = document.getElementById('refresh-preview-btn');

    const codeContainer = document.querySelector('.code-container');
    const gameContainer = document.querySelector('.game-container');
    const codeEditor = document.getElementById('code-editor');
    const gameIframe = document.getElementById('game-iframe');

    const initialGenerationPanel = document.getElementById('initial-generation');
    const modificationPanel = document.getElementById('modification-panel');
    const spinner = document.querySelector('.spinner-container');

    const instructionsContainer = document.getElementById('instructions-container');
    const gameInstructions = document.getElementById('game-instructions');

    // NEW: Console log display elements
    const consoleContainer = document.getElementById('console-container');
    const consoleOutput = document.getElementById('console-output');

    // --- State Variables ---
    const SEPARATOR = '[END_INSTRUCTIONS]';
    let promptHistory = [];
    let consoleLogs = []; // NEW: To store captured logs
    let abortController = null; // NEW: To handle request cancellation

    // --- Core Functions ---
    function cleanHtml(htmlString) {
        return htmlString.replace(/^```html\s*/, '').replace(/\s*```$/, '').trim();
    }

    async function streamResponse(url, body) {
        setLoading(true);
        setView('preview');

        codeEditor.value = '';
        gameInstructions.textContent = '';
        instructionsContainer.classList.add('hidden');
        let currentFullCode = '';

        // NEW: Abort previous request if a new one starts
        if (abortController) {
            abortController.abort();
        }
        abortController = new AbortController();

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: abortController.signal, // NEW: Attach signal
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                currentFullCode += chunk;
                updateUIFromStream(currentFullCode);
            }

            const { html } = parseFullResponse(currentFullCode);
            updateIframe(html);
            showModificationPanel();

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Fetch aborted by user.');
            } else {
                console.error('Streaming failed:', error);
                codeEditor.value = `Error: Failed to get response from server. Check console for details.`;
                setView('code');
            }
        } finally {
            setLoading(false);
            abortController = null;
        }
    }

    function parseFullResponse(fullText) {
        let instructions = '', html = '';
        const separatorIndex = fullText.indexOf(SEPARATOR);

        if (separatorIndex !== -1) {
            instructions = fullText.substring(0, separatorIndex).replace('[INSTRUCTIONS]', '').trim();
            html = fullText.substring(separatorIndex + SEPARATOR.length).trim();
        } else {
            if (fullText.trim().startsWith('<!DOCTYPE html>') || fullText.trim().startsWith('<html')) {
                html = fullText;
            } else {
                instructions = fullText;
            }
        }
        return { instructions, html: cleanHtml(html) };
    }

    function updateUIFromStream(fullText) {
        const { instructions, html } = parseFullResponse(fullText);
        if (instructions) {
            instructionsContainer.classList.remove('hidden');
            gameInstructions.textContent = instructions;
        }
        if (html) {
            codeEditor.value = html;
        } else if (fullText.indexOf(SEPARATOR) === -1) {
            codeEditor.value = "Waiting for HTML code...";
        }
    }

    // --- Event Handlers ---
    generateBtn.addEventListener('click', () => {
        const prompt = promptInput.value.trim();
        if (!prompt) return alert('Please enter a game idea!');
        promptHistory = [prompt];
        streamResponse('/generate', { prompt });
    });

    modifyBtn.addEventListener('click', () => {
        const prompt = modificationInput.value.trim();
        if (!prompt) return alert('Please describe your modification!');
        promptHistory.push(prompt);

        const currentHtml = codeEditor.value;
        if (!currentHtml) return alert('There is no code to modify!');

        // NEW: Send captured console logs to the AI
        const logs = consoleLogs.join('\n');
        console.log("Sending to /modify:", { prompt, logs, history: promptHistory });

        streamResponse('/modify', {
            prompt,
            current_code: currentHtml,
            console_logs: logs,
            prompt_history: promptHistory
        });
    });

    downloadBtn.addEventListener('click', () => {
        const html = codeEditor.value;
        if (!html) return alert('No game code to download!');
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ai_generated_game.html';
        a.click();
        URL.revokeObjectURL(url);
    });

    openTabBtn.addEventListener('click', () => {
        const html = codeEditor.value;
        if (!html) return alert('No game code to open!');
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    });

    // NEW: Copy code button handler
    copyCodeBtn.addEventListener('click', async () => {
        const code = codeEditor.value;
        if (!code) return alert('No code to copy!');
        try {
            await navigator.clipboard.writeText(code);
            copyCodeBtn.textContent = 'Copied!';
            setTimeout(() => { copyCodeBtn.textContent = 'Copy Code'; }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('Failed to copy code.');
        }
    });

    refreshPreviewBtn.addEventListener('click', () => {
        const editedHtml = codeEditor.value;
        updateIframe(editedHtml);
        setView('preview');
    });

    // --- UI Helper Functions ---
    function setView(view) {
        if (view === 'preview') {
            gameContainer.classList.remove('hidden');
            codeContainer.classList.add('hidden');
            togglePreviewBtn.classList.add('active');
            toggleCodeBtn.classList.remove('active');
            refreshPreviewBtn.classList.add('hidden');
        } else { // 'code'
            gameContainer.classList.add('hidden');
            codeContainer.classList.remove('hidden');
            togglePreviewBtn.classList.remove('active');
            toggleCodeBtn.classList.add('active');
            refreshPreviewBtn.classList.remove('hidden');
        }
    }

    togglePreviewBtn.addEventListener('click', () => setView('preview'));
    toggleCodeBtn.addEventListener('click', () => setView('code'));

    function updateIframe(htmlContent) {
        // NEW: Inject a script to capture console logs from the iframe
        const consoleLoggerScript = `
            <script>
                const originalConsole = { ...window.console };
                const postLog = (type, args) => {
                    try {
                        const message = args.map(arg => {
                            if (arg instanceof Error) return arg.stack;
                            if (typeof arg === 'object' && arg !== null) {
                                try { return JSON.stringify(arg); } catch(e) { return 'Unserializable Object'; }
                            }
                            return String(arg);
                        }).join(' ');
                        window.parent.postMessage({ type: 'console', level: type, message }, '*');
                    } catch (e) {
                        // Avoid infinite loops if postMessage fails
                    }
                };
                window.console.log = (...args) => { postLog('log', args); originalConsole.log(...args); };
                window.console.error = (...args) => { postLog('error', args); originalConsole.error(...args); };
                window.console.warn = (...args) => { postLog('warn', args); originalConsole.warn(...args); };
                window.addEventListener('error', event => {
                    postLog('error', [event.message, 'at', event.filename + ':' + event.lineno]);
                });
            </script>
        `;

        // Reset logs for the new code
        consoleLogs = [];
        updateConsoleDisplay();

        // Prepend the script to the HTML content
        gameIframe.srcdoc = consoleLoggerScript + htmlContent;
    }

    // NEW: Listen for messages (console logs) from the iframe
    window.addEventListener('message', event => {
        if (event.data && event.data.type === 'console') {
            const { level, message } = event.data;
            const logEntry = `[${level.toUpperCase()}] ${message}`;
            consoleLogs.push(logEntry);
            updateConsoleDisplay();
        }
    });

    // NEW: Function to update the on-screen console display
    function updateConsoleDisplay() {
        if (consoleLogs.length > 0) {
            consoleContainer.classList.remove('hidden');
            consoleOutput.value = consoleLogs.join('\n');
            consoleOutput.scrollTop = consoleOutput.scrollHeight; // Auto-scroll
        } else {
            consoleContainer.classList.add('hidden');
            consoleOutput.value = '';
        }
    }

    function setLoading(isLoading) {
        spinner.classList.toggle('hidden', !isLoading);
        generateBtn.disabled = isLoading;
        modifyBtn.disabled = isLoading;
    }

    function showModificationPanel() {
        initialGenerationPanel.classList.add('hidden');
        modificationPanel.classList.remove('hidden');
    }
});