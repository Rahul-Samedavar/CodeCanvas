document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const promptInput = document.getElementById('prompt-input');
    const generateBtn = document.getElementById('generate-btn');
    const modificationInput = document.getElementById('modification-input');
    const modifyBtn = document.getElementById('modify-btn');
    const downloadBtn = document.getElementById('download-btn');
    
    const codeOutput = document.getElementById('code-output');
    const gameIframe = document.getElementById('game-iframe');
    
    const initialGenerationPanel = document.getElementById('initial-generation');
    const modificationPanel = document.getElementById('modification-panel');
    const spinner = document.querySelector('.spinner-container');

    // NEW instruction elements
    const instructionsContainer = document.getElementById('instructions-container');
    const gameInstructions = document.getElementById('game-instructions');

    // --- State Variables ---
    let currentFullCode = '';
    const SEPARATOR = '[END_INSTRUCTIONS]';

    function cleanHtml(htmlString) {
        let cleaned = htmlString.replace(/^```html\s*/, '').replace(/\s*```$/, '');
        return cleaned.trim();
    }

    // --- Core Streaming Logic (Refactored) ---
    async function streamResponse(url, body) {
        setLoading(true);
        
        // Reset UI for new generation
        codeOutput.textContent = '';
        gameInstructions.textContent = '';
        instructionsContainer.classList.add('hidden');
        currentFullCode = '';

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                currentFullCode += chunk;
                
                // Real-time parsing and routing
                updateUIFromStream(currentFullCode);
            }

            // Final cleanup and render after stream finishes
            const { instructions, html } = parseFullResponse(currentFullCode);
            updateIframe(html);
            showModificationPanel();

        } catch (error) {
            console.error('Streaming failed:', error);
            codeOutput.textContent = `Error: Failed to get response from server. Check console for details.`;
        } finally {
            setLoading(false);
        }
    }
    
    /**
     * Parses the full streamed response into instructions and HTML.
     * @param {string} fullText The complete text from the stream.
     * @returns {{instructions: string, html: string}}
     */
    function parseFullResponse(fullText) {
        let instructions = '';
        let html = '';

        const separatorIndex = fullText.indexOf(SEPARATOR);

        if (separatorIndex !== -1) {
            instructions = fullText.substring(0, separatorIndex)
                                    .replace('[INSTRUCTIONS]', '')
                                    .trim();
            html = fullText.substring(separatorIndex + SEPARATOR.length).trim();
        } else {
            // Fallback if the separator isn't found
            // Check if the text looks like HTML. If not, assume it's an error message or instructions.
            if (fullText.trim().startsWith('<!DOCTYPE html>') || fullText.trim().startsWith('<html')) {
                html = fullText;
            } else {
                instructions = fullText;
            }
        }
        return { instructions, html: cleanHtml(html) };
    }

    /**
     * Updates the Instructions and Code UI elements during streaming.
     * @param {string} fullText The text received so far.
     */
    function updateUIFromStream(fullText) {
        const { instructions, html } = parseFullResponse(fullText);
        
        if (instructions) {
            instructionsContainer.classList.remove('hidden');
            gameInstructions.textContent = instructions;
        }
        if (html) {
            codeOutput.textContent = html;
        } else if (fullText.indexOf(SEPARATOR) === -1) {
            // If we are still in the instructions part, show a placeholder in code view
            codeOutput.textContent = "Waiting for HTML code...";
        }
    }


    // --- Event Handlers ---
    generateBtn.addEventListener('click', () => {
        const prompt = promptInput.value;
        if (!prompt) return alert('Please enter a game idea!');
        streamResponse('/generate', { prompt });
    });

    modifyBtn.addEventListener('click', () => {
        const prompt = modificationInput.value;
        if (!prompt) return alert('Please describe your modification!');
        
        // When modifying, we need to send the *HTML part only* back to the AI.
        const { html: currentHtml } = parseFullResponse(currentFullCode);

        streamResponse('/modify', { 
            prompt,
            current_code: currentHtml
        });
    });

    downloadBtn.addEventListener('click', () => {
        const { html } = parseFullResponse(currentFullCode);
        if (!html) return alert('No game code to download!');
        
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ai_generated_game.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // --- UI Helper Functions ---
    function updateIframe(htmlContent) {
        gameIframe.srcdoc = htmlContent;
    }

    function setLoading(isLoading) {
        spinner.classList.toggle('hidden', !isLoading);
        generateBtn.disabled = isLoading;
        modifyBtn.disabled = isLoading;
    }
    
    function showModificationPanel() {
        initialGenerationPanel.classList.add('hidden'); // Hide initial prompt
        modificationPanel.classList.remove('hidden');
    }
});