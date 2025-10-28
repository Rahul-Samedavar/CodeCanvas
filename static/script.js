document.addEventListener("DOMContentLoaded", () => {
  // --- Element Selectors ---
  const promptInput = document.getElementById("prompt-input");
  const generateBtn = document.getElementById("generate-btn");
  const modificationInput = document.getElementById("modification-input");
  const modifyBtn = document.getElementById("modify-btn");
  const downloadBtn = document.getElementById("download-btn");
  const openTabBtn = document.getElementById("open-tab-btn");
  const copyCodeBtn = document.getElementById("copy-code-btn");

  const togglePreviewBtn = document.getElementById("toggle-preview-btn");
  const toggleCodeBtn = document.getElementById("toggle-code-btn");
  const refreshPreviewBtn = document.getElementById("refresh-preview-btn");

  const codeContainer = document.querySelector(".code-container");
  const previewContainer = document.querySelector(".preview-container");
  const monacoContainer = document.getElementById("monaco-editor");
  const gameIframe = document.getElementById("game-iframe");

  const initialGenerationPanel = document.getElementById("initial-generation");
  const modificationPanel = document.getElementById("modification-panel");
  const spinner = document.querySelector(".spinner-container");

  const analysisContainer = document.getElementById("analysis-container");
  const aiAnalysis = document.getElementById("ai-analysis");
  const changesContainer = document.getElementById("changes-container");
  const summaryOfChanges = document.getElementById("summary-of-changes");
  const instructionsContainer = document.getElementById(
    "instructions-container"
  );
  const gameInstructions = document.getElementById("game-instructions");

  const consoleContainer = document.getElementById("console-container");
  const consoleOutput = document.getElementById("console-output");

  const followUpInput = document.getElementById("follow-up-input");
  const followUpBtn = document.getElementById("follow-up-btn");
  const followUpSpinner = document.getElementById("follow-up-spinner");
  const followUpOutputContainer = document.getElementById(
    "follow-up-output-container"
  );
  const followUpOutput = document.getElementById("follow-up-output");

  const versionHistoryControls = document.getElementById(
    "version-history-controls"
  );
  const versionHistorySelect = document.getElementById(
    "version-history-select"
  );

  const loadSessionBtn = document.getElementById("load-session-btn");
  const saveSessionBtn = document.getElementById("save-session-btn");
  const loadSessionPopup = document.getElementById("load-session-popup");
  const saveSessionPopup = document.getElementById("save-session-popup");
  const loadSessionPopupClose = document.getElementById(
    "load-session-popup-close"
  );
  const saveSessionPopupClose = document.getElementById(
    "save-session-popup-close"
  );

  const followupFloat = document.getElementById("followup-float");
  const followupBtn = document.getElementById("followup-btn");
  const followupPopup = document.getElementById("followup-popup");
  const followupPopupClose = document.getElementById("followup-popup-close");

  const sessionSelect = document.getElementById("session-select");
  const sessionNameInput = document.getElementById("session-name-input");
  const loadSessionActionBtn = document.getElementById(
    "load-session-action-btn"
  );
  const saveSessionActionBtn = document.getElementById(
    "save-session-action-btn"
  );
  const deleteSessionBtn = document.getElementById("delete-session-btn");
  const newSessionBtn = document.getElementById("new-session-btn");

  const hamburgerBtn = document.getElementById("hamburger-btn");
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  const themeToggle = document.getElementById("theme-toggle");

  const generateFileInput = document.getElementById("generate-file-input");
  const generateFileList = document.getElementById("generate-file-list");
  const modifyFileInput = document.getElementById("modify-file-input");
  const modifyFileList = document.getElementById("modify-file-list");

  // --- State Variables ---
  let promptHistory = [];
  let consoleLogs = [];
  let abortController = null;
  let versionHistory = [];
  let currentSessionId = null;
  const clientSideAssets = new Map();
  const DB_NAME = "CodeCanvasDB";
  const DB_VERSION = 1;
  const STORE_NAME = "sessions";
  let marked = null;
  let db = null;
  let monacoEditor = null;
  let monaco = null;
  let lastScrollPosition = { lineNumber: 1, column: 1 };
  let hasGeneratedContent = false;
  const mainContainer = document.querySelector(".main-container");

  // --- IndexedDB Functions ---
  function initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };
      request.onupgradeneeded = (event) => {
        db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("name", "name", { unique: false });
          store.createIndex("savedAt", "savedAt", { unique: false });
        }
      };
    });
  }

  async function saveSessionToDB(sessionData) {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(sessionData);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getSessionsFromDB() {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function deleteSessionFromDB(sessionId) {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(sessionId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

    // --- Core Application Logic ---

    class StreamParser {
        constructor() {
            this.reset();
        }

        reset() {
            this.analysis = "";
            this.changes = "";
            this.instructions = "";
            this.html = "";
            this.currentSection = null;
            this.buffer = ""; 
        }

        processChunk(chunk) {
            this.buffer += chunk;
            const lines = this.buffer.split('\n');
            this.buffer = lines.pop(); 

            for (const line of lines) {
                const trimmedLine = line.trim();
                
                if (trimmedLine === '[ANALYSIS]') { this.currentSection = 'ANALYSIS'; continue; }
                if (trimmedLine === '[END_ANALYSIS]') { this.currentSection = null; continue; }
                if (trimmedLine === '[CHANGES]') { this.currentSection = 'CHANGES'; continue; }
                if (trimmedLine === '[END_CHANGES]') { this.currentSection = null; continue; }
                if (trimmedLine === '[INSTRUCTIONS]') { this.currentSection = 'INSTRUCTIONS'; continue; }
                if (trimmedLine === '[END_INSTRUCTIONS]') { this.currentSection = 'HTML'; continue; }

                switch (this.currentSection) {
                    case 'ANALYSIS': this.analysis += line + '\n'; break;
                    case 'CHANGES': this.changes += line + '\n'; break;
                    case 'INSTRUCTIONS': this.instructions += line + '\n'; break;
                    case 'HTML': this.html += line + '\n'; break;
                    default:
                        if (trimmedLine.startsWith('<!DOCTYPE html>') || this.currentSection === 'HTML') {
                            this.currentSection = 'HTML';
                            this.html += line + '\n';
                        }
                        break;
                }
            }
        }
        
        /**
         * BUGFIX: Returns the current state NON-DESTRUCTIVELY for live UI updates.
         * It does NOT process the buffer, preventing duplication errors.
         */
        getCurrentState() {
            return {
                analysis: this.analysis.trim(),
                changes: this.changes.trim(),
                instructions: this.instructions.trim(),
                html: this.cleanHtml(this.html),
            };
        }

        /**
         * BUGFIX: Finalizes the stream by processing the remaining buffer.
         * This should ONLY be called once at the very end.
         */
        finalize() {
            if (this.buffer) {
                // Assume any remaining buffer content belongs to the last active section, defaulting to HTML
                const targetSection = this.currentSection || 'HTML';
                switch (targetSection) {
                    case 'ANALYSIS': this.analysis += this.buffer; break;
                    case 'CHANGES': this.changes += this.buffer; break;
                    case 'INSTRUCTIONS': this.instructions += this.buffer; break;
                    case 'HTML': default: this.html += this.buffer; break;
                }
                this.buffer = ""; // Clear the buffer after finalizing
            }
            return this.getCurrentState();
        }

        cleanHtml(htmlString) {
            return htmlString.replace(/^```html\s*|\s*```$/g, "").trim();
        }
    }


  async function streamResponse(url, body, targetElement) {
    setLoading(true, url);
    const parser = new StreamParser();

    if (!targetElement) {
      setView("code");
      if (monacoEditor) monacoEditor.setValue("");
      clearInfoPanels();
    }

    if (abortController) abortController.abort();
    abortController = new AbortController();

    try {
      const isFormData = body instanceof FormData;
      const response = await fetch(url, {
        method: "POST",
        body: isFormData ? body : JSON.stringify(body),
        headers: isFormData ? {} : { "Content-Type": "application/json" },
        signal: abortController.signal,
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        let chunk = decoder.decode(value, { stream: true });

        if (chunk.includes("[STREAM_RESTART]")) {
            console.warn("Stream restart signal received.");
            showNotification("Primary model failed; switching to fallback.", "warning");
            parser.reset();
            clearInfoPanels();
            if (monacoEditor) monacoEditor.setValue("");
            chunk = chunk.replace(/\[STREAM_RESTART\]\s*\n?/, "");
        }
        
        if (targetElement) {
            targetElement.textContent += chunk;
            targetElement.scrollTop = targetElement.scrollHeight;
        } else {
            parser.processChunk(chunk);
            // BUGFIX: Use the non-destructive getter for live updates
            const currentData = parser.getCurrentState();
            updateUIFromStream(currentData);
        }
      }

      if (!targetElement) {
        const prompt = isFormData ? body.get("prompt") : body.prompt;
        // BUGFIX: Call finalize() only once at the end of the stream
        const finalData = parser.finalize(); 
        
        // Final UI update with the fully parsed data
        updateUIFromStream(finalData); 

        // Update iframe and save version with the final, clean data
        updateIframe(finalData.html);
        saveVersion({ ...finalData, prompt });
        showModificationPanel();
        setTimeout(minimizeInfoPanels, 2000);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Streaming failed:", error);
        const errorMessage = `Error: Failed to get response. Details: ${error.message}`;
        if (targetElement) {
          targetElement.textContent = "Error: Could not get response.";
        } else if (monacoEditor) {
          monacoEditor.setValue(errorMessage);
          setView("code");
        }
      }
    } finally {
      setLoading(false, url);
      abortController = null;
    }
  }

  function updateUIFromStream({ analysis, changes, instructions, html }) {
    if (analysis) {
      analysisContainer.classList.remove("hidden");
      aiAnalysis.innerHTML = marked ? marked.parse(analysis) : analysis;
      aiAnalysis.scrollTop = aiAnalysis.scrollHeight;
    }

    if (changes) {
      changesContainer.classList.remove("hidden");
      summaryOfChanges.innerHTML = marked ? marked.parse(changes) : changes;
      summaryOfChanges.scrollTop = summaryOfChanges.scrollHeight;
    }

    if (instructions) {
      instructionsContainer.classList.remove("hidden");
      gameInstructions.innerHTML = marked ? marked.parse(instructions) : instructions;
      gameInstructions.scrollTop = gameInstructions.scrollHeight;
    }

    if (html && monacoEditor && monacoEditor.getValue() !== html) {
      const currentPosition = monacoEditor.getPosition();
      monacoEditor.setValue(html);
      if(currentPosition) monacoEditor.setPosition(currentPosition);
    }
  }

  // --- Client-Side Asset Handling ---
  function handleFileSelection(event, fileListElement) {
    for (const file of event.target.files) {
      if (!clientSideAssets.has(file.name)) {
        clientSideAssets.set(file.name, {
          file: file,
          blobUrl: URL.createObjectURL(file),
        });
      }
    }
    renderSelectedFiles(fileListElement);
    event.target.value = "";
  }

  function renderSelectedFiles(fileListElement) {
    fileListElement.innerHTML = "";
    fileListElement.classList.toggle("hidden", clientSideAssets.size === 0);
    clientSideAssets.forEach((asset, fileName) => {
      const fileItem = document.createElement("div");
      fileItem.className = "file-item";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = fileName;
      const removeBtn = document.createElement("button");
      removeBtn.innerHTML = "&times;";
      removeBtn.className = "file-remove-btn";
      removeBtn.onclick = () => {
        URL.revokeObjectURL(asset.blobUrl);
        clientSideAssets.delete(fileName);
        renderSelectedFiles(generateFileList);
        renderSelectedFiles(modifyFileList);
      };
      fileItem.appendChild(nameSpan);
      fileItem.appendChild(removeBtn);
      fileListElement.appendChild(fileItem);
    });
  }

  async function deserializeAssets(assets) {
    clientSideAssets.clear();
    for (const assetData of assets) {
      try {
        const blob = new Blob([assetData.data], { type: assetData.type });
        const file = new File([blob], assetData.fileName, { type: assetData.type });
        clientSideAssets.set(assetData.fileName, {
          file: file,
          blobUrl: URL.createObjectURL(blob),
        });
      } catch (error) {
        console.error(`Failed to restore asset ${assetData.fileName}:`, error);
      }
    }
    renderSelectedFiles(generateFileList);
    renderSelectedFiles(modifyFileList);
  }

  // --- Event Handlers ---
  loadSessionBtn.addEventListener("click", () => {
    populateSessionDropdown();
    openPopup(loadSessionPopup);
  });

  saveSessionBtn.addEventListener("click", () => {
    openPopup(saveSessionPopup);
  });

  generateFileInput.addEventListener("change", (e) =>
    handleFileSelection(e, generateFileList)
  );
  modifyFileInput.addEventListener("change", (e) =>
    handleFileSelection(e, modifyFileList)
  );

  generateBtn.addEventListener("click", async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      showNotification("Please enter a prompt", "error");
      return;
    }
    hasGeneratedContent = true;
    updateLayoutState();
    versionHistory = [];
    promptHistory = [];
    currentSessionId = null;
    sessionNameInput.value = prompt.substring(0, 50);
    const formData = new FormData();
    formData.append("prompt", prompt);
    clientSideAssets.forEach((asset) =>
      formData.append("files", asset.file, asset.file.name)
    );
    streamResponse("/generate", formData);
    if (window.innerWidth <= 768) closeSidebar();
  });

  modifyBtn.addEventListener("click", async () => {
    const modification = modificationInput.value.trim();
    if (!modification) {
      showNotification("Please enter a modification request", "error");
      return;
    }
    hasGeneratedContent = true;
    updateLayoutState();
    const currentHtml = monacoEditor ? monacoEditor.getValue() : "";
    if (!currentHtml) return alert("There is no code to modify!");
    const formData = new FormData();
    formData.append("prompt", modification);
    formData.append("current_code", currentHtml);
    formData.append("console_logs", consoleLogs.join("\n"));
    promptHistory.forEach((p) => formData.append("prompt_history", p));
    clientSideAssets.forEach((asset) =>
      formData.append("files", asset.file, asset.file.name)
    );
    streamResponse("/modify", formData);
    if (window.innerWidth <= 768) closeSidebar();
  });

  followUpBtn.addEventListener("click", () => {
    const question = followUpInput.value.trim();
    if (!question) return alert("Please ask a question!");
    const currentHtml = monacoEditor ? monacoEditor.getValue() : "";
    if (!currentHtml) return alert("There is no code to ask about!");
    followUpOutputContainer.classList.remove("hidden");
    followUpOutput.innerHTML = "";
    streamResponse(
      "/explain",
      { question, current_code: currentHtml },
      followUpOutput
    );
  });

  downloadBtn.addEventListener("click", async () => {
    const html = monacoEditor ? monacoEditor.getValue() : "";
    if (!html) return alert("No code to download!");
    if (clientSideAssets.size === 0) {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "creation.html";
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const formData = new FormData();
    formData.append("html_content", html);
    clientSideAssets.forEach((asset) =>
      formData.append("files", asset.file, asset.file.name)
    );
    try {
      const response = await fetch("/download_zip", {
        method: "POST",
        body: formData,
      });
      if (!response.ok)
        throw new Error(`Failed to create zip file: ${response.statusText}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "promptlab-project.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to download project as a zip. Check the console.");
    }
  });

  openTabBtn.addEventListener("click", () => {
    const html = monacoEditor ? monacoEditor.getValue() : "";
    if (!html) return alert("No code to open!");
    const processedHtml = replaceAssetPathsWithBlobs(html);
    const blob = new Blob([processedHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  });

  copyCodeBtn.addEventListener("click", async () => {
    const code = monacoEditor ? monacoEditor.getValue() : "";
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      const originalContent = copyCodeBtn.innerHTML;
      copyCodeBtn.innerHTML =
        '<i class="fas fa-check"></i> <span>Copied!</span>';
      setTimeout(() => {
        copyCodeBtn.innerHTML = originalContent;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  });

  refreshPreviewBtn.addEventListener("click", () => {
    const code = monacoEditor ? monacoEditor.getValue() : "";
    updateIframe(code);
    setView("preview");
  });

  togglePreviewBtn.addEventListener("click", () => setView("preview"));
  toggleCodeBtn.addEventListener("click", () => setView("code"));

  // --- UI and State Management Functions ---
  function replaceAssetPathsWithBlobs(htmlContent) {
    if (clientSideAssets.size === 0) return htmlContent;
    let processedHtml = htmlContent;
    clientSideAssets.forEach((asset, fileName) => {
      const safeFileName = fileName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const regex = new RegExp(`(['"])assets/${safeFileName}\\1`, "g");
      processedHtml = processedHtml.replace(regex, `$1${asset.blobUrl}$1`);
    });
    return processedHtml;
  }

  function updateIframe(htmlContent) {
    const consoleLoggerScript = `<script>
        const originalConsole = { ...window.console };
        const postLog = (type, args) => { try { const message = args.map(arg => (typeof arg === 'object' && arg !== null) ? JSON.stringify(arg) : String(arg)).join(' '); window.parent.postMessage({ type: 'console', level: type, message }, '*'); } catch (e) {} };
        window.console.log = (...args) => { postLog('log', args); originalConsole.log(...args); };
        window.console.error = (...args) => { postLog('error', args); originalConsole.error(...args); };
        window.console.warn = (...args) => { postLog('warn', args); originalConsole.warn(...args); };
        window.addEventListener('error', e => postLog('error', [e.message, 'at', e.filename + ':' + e.lineno]));
    </script>`;
    consoleLogs = [];
    updateConsoleDisplay();
    const processedHtml = replaceAssetPathsWithBlobs(htmlContent);
    const enhancedHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>html, body { margin: 0; padding: 0; overflow: auto; min-height: 100vh; box-sizing: border-box; } * { box-sizing: border-box; }</style>${consoleLoggerScript}</head><body>${processedHtml}</body></html>`;
    gameIframe.srcdoc = enhancedHtml;
  }

  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "console") {
      const { level, message } = event.data;
      consoleLogs.push(`[${level.toUpperCase()}] ${message}`);
      updateConsoleDisplay();
    }
  });

  function updateConsoleDisplay() {
    consoleContainer.classList.toggle("hidden", consoleLogs.length === 0);
    if (consoleLogs.length > 0) {
      consoleOutput.value = consoleLogs.join("\n");
      consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }
  }

  function setView(view) {
    if (view === "code" && monacoEditor) {
      lastScrollPosition = monacoEditor.getPosition() || { lineNumber: 1, column: 1 };
    }
    previewContainer.classList.toggle("hidden", view !== "preview");
    codeContainer.classList.toggle("hidden", view === "preview");
    togglePreviewBtn.classList.toggle("active", view === "preview");
    toggleCodeBtn.classList.toggle("active", view !== "preview");
    refreshPreviewBtn.classList.toggle("hidden", view === "preview");

    if (view === "code" && monacoEditor) {
      setTimeout(() => {
        monacoEditor.layout();
        monacoEditor.setPosition(lastScrollPosition);
        monacoEditor.revealPosition(lastScrollPosition);
      }, 100);
    }
  }

  function setLoading(isLoading, url) {
    if (url === "/explain") {
      followUpSpinner.classList.toggle("hidden", !isLoading);
      followUpBtn.disabled = isLoading;
    } else {
      spinner.classList.toggle("hidden", !isLoading);
      generateBtn.disabled = isLoading;
      modifyBtn.disabled = isLoading;
    }
  }

  function showModificationPanel() {
    initialGenerationPanel.classList.add("hidden");
    modificationPanel.classList.remove("hidden");
    followupFloat.classList.add("show");
    renderSelectedFiles(generateFileList);
    renderSelectedFiles(modifyFileList);
  }

  function clearInfoPanels() {
    analysisContainer.classList.add("hidden");
    changesContainer.classList.add("hidden");
    instructionsContainer.classList.add("hidden");
    aiAnalysis.innerHTML = "";
    summaryOfChanges.innerHTML = "";
    gameInstructions.innerHTML = "";
  }

  function minimizeInfoPanels() {
    [analysisContainer, changesContainer, instructionsContainer].forEach((panel) => {
      if (!panel.classList.contains("hidden")) {
        panel.open = false;
      }
    });
  }

  function updateLayoutState() {
    mainContainer.classList.toggle("centered", !hasGeneratedContent);
  }

  // --- Session, Version, and UI Initialization ---
  function saveVersion(versionData) {
    versionHistory.push(versionData);
    promptHistory = versionHistory.map((v) => v.prompt);
    updateVersionHistoryUI();
  }

  function updateVersionHistoryUI() {
    versionHistoryControls.classList.toggle("hidden", versionHistory.length === 0);
    versionHistorySelect.innerHTML = versionHistory
      .map((version, index) => `<option value="${index}">V${index + 1}: ${version.prompt.substring(0, 50)}...</option>`)
      .reverse()
      .join("");
    versionHistorySelect.value = versionHistory.length - 1;
  }

  function loadVersion(index) {
    const version = versionHistory[index];
    if (!version) return;
    if (monacoEditor) {
      monacoEditor.setValue(version.html || "");
    }
    updateIframe(version.html || "");
    clearInfoPanels();
    if (version.analysis) {
      analysisContainer.classList.remove("hidden");
      aiAnalysis.innerHTML = marked.parse(version.analysis);
    }
    if (version.changes) {
      changesContainer.classList.remove("hidden");
      summaryOfChanges.innerHTML = marked.parse(version.changes);
    }
    if (version.instructions) {
      instructionsContainer.classList.remove("hidden");
      gameInstructions.innerHTML = marked.parse(version.instructions);
    }
    promptHistory = versionHistory.slice(0, index + 1).map((v) => v.prompt);
  }

  versionHistorySelect.addEventListener("change", (e) => loadVersion(Number(e.target.value)));

  async function populateSessionDropdown() {
    try {
      const sessions = await getSessionsFromDB();
      if (sessions.length === 0) {
        sessionSelect.innerHTML = '<option value="">No sessions found</option>';
        return;
      }
      sessionSelect.innerHTML = sessions
        .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
        .map((s) => `<option value="${s.id}">${s.name} - ${new Date(s.savedAt).toLocaleDateString()}</option>`)
        .join("");
    } catch (error) {
      console.error("Error loading sessions:", error);
      sessionSelect.innerHTML = '<option value="">Error loading sessions</option>';
    }
  }

  async function saveCurrentSession() {
    const sessionName = sessionNameInput.value.trim();
    if (!sessionName) return alert("Please enter a session name.");
    if (versionHistory.length === 0) return alert("Nothing to save.");

    try {
      saveSessionActionBtn.disabled = true;
      saveSessionActionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      
      const assets = [];
      for (const [fileName, asset] of clientSideAssets.entries()) {
        const arrayBuffer = await asset.file.arrayBuffer();
        assets.push({ fileName, data: arrayBuffer, type: asset.file.type });
      }

      const sessionData = {
        id: currentSessionId || Date.now(),
        name: sessionName,
        history: versionHistory,
        assets,
        savedAt: new Date().toISOString(),
      };

      await saveSessionToDB(sessionData);
      currentSessionId = sessionData.id;
      
      saveSessionActionBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
      setTimeout(() => {
        closePopup(saveSessionPopup);
        saveSessionActionBtn.disabled = false;
        saveSessionActionBtn.innerHTML = '<i class="fas fa-save"></i> Save';
      }, 1500);
    } catch (error) {
      console.error("Error saving session:", error);
      alert(`Failed to save session: ${error.message}`);
      saveSessionActionBtn.disabled = false;
      saveSessionActionBtn.innerHTML = '<i class="fas fa-save"></i> Save';
    }
  }

  async function loadSelectedSession() {
    const sessionId = sessionSelect.value;
    if (!sessionId) return alert("Please select a session to load.");
    try {
      const sessions = await getSessionsFromDB();
      const session = sessions.find((s) => s.id === Number(sessionId));
      if (!session) return alert("Session not found.");
      
      versionHistory = session.history || [];
      currentSessionId = session.id;
      sessionNameInput.value = session.name;

      clientSideAssets.forEach(asset => URL.revokeObjectURL(asset.blobUrl));
      clientSideAssets.clear();
      if (session.assets) {
        await deserializeAssets(session.assets);
      }

      updateVersionHistoryUI();
      if (versionHistory.length > 0) {
        loadVersion(versionHistory.length - 1);
      }
      showModificationPanel();
      hasGeneratedContent = true;
      updateLayoutState();
      closePopup(loadSessionPopup);
    } catch (error) {
      console.error("Failed to load session:", error);
      alert(`Failed to load session: ${error.message}`);
    }
  }

  async function deleteSelectedSession() {
    const sessionId = sessionSelect.value;
    if (!sessionId || !confirm("Are you sure you want to delete this session? This cannot be undone.")) return;
    try {
      await deleteSessionFromDB(Number(sessionId));
      if (currentSessionId === Number(sessionId)) {
        startNewSession();
      }
      await populateSessionDropdown();
    } catch (error) {
      console.error("Error deleting session:", error);
      alert(`Failed to delete session: ${error.message}`);
    }
  }

  function startNewSession() {
    versionHistory = [];
    promptHistory = [];
    currentSessionId = null;
    sessionNameInput.value = "";
    promptInput.value = "";
    modificationInput.value = "";
    clientSideAssets.forEach(asset => URL.revokeObjectURL(asset.blobUrl));
    clientSideAssets.clear();
    renderSelectedFiles(generateFileList);
    renderSelectedFiles(modifyFileList);
    if (monacoEditor) monacoEditor.setValue("");
    updateIframe("");
    clearInfoPanels();
    initialGenerationPanel.classList.remove("hidden");
    modificationPanel.classList.add("hidden");
    followupFloat.classList.remove("show");
    versionHistoryControls.classList.add("hidden");
    hasGeneratedContent = false;
    updateLayoutState();
    closePopup(loadSessionPopup);
  }

  saveSessionActionBtn.addEventListener("click", saveCurrentSession);
  loadSessionActionBtn.addEventListener("click", loadSelectedSession);
  deleteSessionBtn.addEventListener("click", deleteSelectedSession);
  newSessionBtn.addEventListener("click", startNewSession);

  // --- Popups and Mobile Menu ---
  function openPopup(popup) { popup.classList.remove("hidden"); }
  function closePopup(popup) { popup.classList.add("hidden"); }
  
  loadSessionPopupClose.addEventListener("click", () => closePopup(loadSessionPopup));
  saveSessionPopupClose.addEventListener("click", () => closePopup(saveSessionPopup));
  followupPopupClose.addEventListener("click", () => closePopup(followupPopup));
  
  [loadSessionPopup, saveSessionPopup, followupPopup].forEach((popup) => {
    popup.addEventListener("click", (e) => {
      if (e.target.classList.contains("popup-overlay")) closePopup(popup);
    });
  });
  
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      [loadSessionPopup, saveSessionPopup, followupPopup].forEach(closePopup);
    }
  });

  hamburgerBtn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    sidebarOverlay.classList.toggle("show");
  });
  sidebarOverlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
  });
  
  // --- Theme ---
  function initTheme() {
    const theme = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", theme);
    updateThemeIcon(theme);
    updateMonacoTheme(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    updateThemeIcon(next);
    updateMonacoTheme(next);
  }

  function updateThemeIcon(theme) {
    themeToggle.querySelector("i").className = theme === "dark" ? "fas fa-sun" : "fas fa-moon";
  }

  function updateMonacoTheme(theme) {
    if (monaco && monaco.editor) {
      monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "vs");
    }
  }
  
  themeToggle.addEventListener("click", toggleTheme);

  // --- Initialization ---
  function initializeMonacoEditor() {
    if (typeof require === "undefined") {
      console.error("Monaco Editor loader not available.");
      return;
    }
    require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs" } });
    require(["vs/editor/editor.main"], () => {
      monaco = window.monaco;
      const theme = localStorage.getItem("theme") || "dark";
      monacoEditor = monaco.editor.create(monacoContainer, {
        value: "// AI code will appear here. Describe your idea to get started!",
        language: "html",
        theme: theme === "dark" ? "vs-dark" : "vs",
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: "on",
      });
    });
  }

  async function initializeApp() {
    if (window.marked) {
      marked = window.marked;
    } else {
      console.warn("Marked.js not loaded. AI thoughts will be unformatted.");
    }
    await initDB();
    initTheme();
    initializeMonacoEditor();
    updateLayoutState();
    populateSessionDropdown();
  }

  followupBtn.addEventListener("click", () => openPopup(followupPopup));
  
  function showNotification(message, type) {
      // A simple alert, can be replaced with a more sophisticated notification system
      alert(`[${type.toUpperCase()}] ${message}`);
  }

  initializeApp();
});