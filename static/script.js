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
  const codeEditor = document.getElementById("code-editor");
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
  let clientSideAssets = new Map();
  const SESSIONS_STORAGE_KEY = "CodeCanvasSessions";
  const marked = window.marked;

  // --- Core Functions ---

  function cleanHtml(htmlString) {
    return htmlString
      .replace(/^```html\s*/, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  async function streamResponse(url, body, targetElement) {
    setLoading(true, url);
    if (!targetElement) {
      // Don't clear panels for /explain requests
      setView("preview");
      codeEditor.value = "";
      clearInfoPanels();
    }
    let currentFullText = "";
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

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        currentFullText += chunk;
        if (targetElement) {
          targetElement.innerHTML = marked.parse(currentFullText);
        } else {
          updateUIFromStream(currentFullText);
        }
      }

      if (!targetElement) {
        const prompt = isFormData ? body.get("prompt") : body.prompt;
        const finalData = parseFullResponse(currentFullText);
        codeEditor.value = finalData.html;
        updateIframe(finalData.html);
        saveVersion({ ...finalData, prompt: prompt });
        showModificationPanel();
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Streaming failed:", error);
        if (targetElement) {
          targetElement.textContent = "Error: Could not get response.";
        } else {
          codeEditor.value = `Error: Failed to get response. Check console.`;
          setView("code");
        }
      }
    } finally {
      setLoading(false, url);
      abortController = null;
    }
  }

  function parseFullResponse(fullText) {
    const result = { analysis: "", changes: "", instructions: "", html: "" };
    const analysisMatch = fullText.match(
      /\[ANALYSIS\]([\s\S]*?)\[END_ANALYSIS\]/
    );
    if (analysisMatch) result.analysis = analysisMatch[1].trim();
    const changesMatch = fullText.match(/\[CHANGES\]([\s\S]*?)\[END_CHANGES\]/);
    if (changesMatch) result.changes = changesMatch[1].trim();
    const instructionsMatch = fullText.match(
      /\[INSTRUCTIONS\]([\s\S]*?)\[END_INSTRUCTIONS\]/
    );
    if (instructionsMatch) result.instructions = instructionsMatch[1].trim();
    const htmlStartIndex = fullText.indexOf("[END_INSTRUCTIONS]");
    if (htmlStartIndex !== -1) {
      const potentialHtml = fullText
        .substring(htmlStartIndex + "[END_INSTRUCTIONS]".length)
        .trim();
      if (
        potentialHtml.startsWith("<!DOCTYPE html>") ||
        potentialHtml.startsWith("<html")
      ) {
        result.html = cleanHtml(potentialHtml);
      }
    }
    return result;
  }

  function updateUIFromStream(fullText) {
    const { analysis, changes, instructions, html } =
      parseFullResponse(fullText);
    if (analysis) {
      analysisContainer.classList.remove("hidden");
      aiAnalysis.innerHTML = marked.parse(analysis);
    }
    if (changes) {
      changesContainer.classList.remove("hidden");
      summaryOfChanges.innerHTML = marked.parse(changes);
    }
    if (instructions) {
      instructionsContainer.classList.remove("hidden");
      gameInstructions.innerHTML = marked.parse(instructions);
    }
    if (html) {
      codeEditor.value = html;
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

  // --- Event Handlers ---

  // *** THE FIX: ADD THESE EVENT LISTENERS BACK ***
  loadSessionBtn.addEventListener("click", () => {
    populateSessionDropdown();
    openPopup(loadSessionPopup);
  });
  saveSessionBtn.addEventListener("click", () => {
    openPopup(saveSessionPopup);
  });
  // ***********************************************

  generateFileInput.addEventListener("change", (e) =>
    handleFileSelection(e, generateFileList)
  );
  modifyFileInput.addEventListener("change", (e) =>
    handleFileSelection(e, modifyFileList)
  );

  generateBtn.addEventListener("click", () => {
    const prompt = promptInput.value.trim();
    if (!prompt) return alert("Please enter an idea!");
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

  modifyBtn.addEventListener("click", () => {
    const prompt = modificationInput.value.trim();
    if (!prompt) return alert("Please describe your modification!");
    const currentHtml = codeEditor.value;
    if (!currentHtml) return alert("There is no code to modify!");
    const formData = new FormData();
    formData.append("prompt", prompt);
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
    const currentHtml = codeEditor.value;
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
    const html = codeEditor.value;
    if (!html) return alert("No code to download!");
    if (clientSideAssets.size === 0) {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "codecanvas_creation.html";
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
      a.download = "codecanvas-project.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to download project as a zip. Check the console.");
    }
  });

  openTabBtn.addEventListener("click", () => {
    const html = codeEditor.value;
    if (!html) return alert("No code to open!");
    const processedHtml = replaceAssetPathsWithBlobs(html);
    const blob = new Blob([processedHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  });

  copyCodeBtn.addEventListener("click", async () => {
    const code = codeEditor.value;
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
    updateIframe(codeEditor.value);
    setView("preview");
  });

  // --- UI and State Management Functions ---

  function replaceAssetPathsWithBlobs(htmlContent) {
    if (clientSideAssets.size === 0) return htmlContent;
    let processedHtml = htmlContent;
    clientSideAssets.forEach((asset, fileName) => {
      const safeFileName = fileName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
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
    gameIframe.srcdoc = consoleLoggerScript + processedHtml;
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
    previewContainer.classList.toggle("hidden", view !== "preview");
    codeContainer.classList.toggle("hidden", view === "preview");
    togglePreviewBtn.classList.toggle("active", view === "preview");
    toggleCodeBtn.classList.toggle("active", view !== "preview");
    refreshPreviewBtn.classList.toggle("hidden", view === "preview");
  }

  togglePreviewBtn.addEventListener("click", () => setView("preview"));
  toggleCodeBtn.addEventListener("click", () => setView("code"));

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

  // --- Session, Version, and UI Initialization ---
  function saveVersion(versionData) {
    versionHistory.push(versionData);
    promptHistory = versionHistory.map((v) => v.prompt);
    updateVersionHistoryUI();
  }

  function updateVersionHistoryUI() {
    versionHistoryControls.classList.toggle(
      "hidden",
      versionHistory.length === 0
    );
    versionHistorySelect.innerHTML = versionHistory
      .map((version, index) => {
        const promptSnippet =
          version.prompt.length > 50
            ? version.prompt.substring(0, 47) + "..."
            : version.prompt;
        return `<option value="${index}">V${
          index + 1
        }: ${promptSnippet}</option>`;
      })
      .reverse()
      .join("");
    versionHistorySelect.value = versionHistory.length - 1;
  }

  function loadVersion(index) {
    const version = versionHistory[index];
    if (!version) return;
    codeEditor.value = version.html || "";
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

  versionHistorySelect.addEventListener("change", (e) =>
    loadVersion(Number(e.target.value))
  );

  function getSessions() {
    try {
      return JSON.parse(localStorage.getItem(SESSIONS_STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }
  function saveSessions(sessions) {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  }
  function populateSessionDropdown() {
    const sessions = getSessions();
    sessionSelect.innerHTML = sessions.length
      ? sessions
          .map((s) => `<option value="${s.id}">${s.name}</option>`)
          .join("")
      : '<option value="">No sessions</option>';
  }

  function saveCurrentSession() {
    const sessionName = sessionNameInput.value.trim();
    if (!sessionName) return alert("Please enter a name.");
    if (versionHistory.length === 0) return alert("Nothing to save.");
    const sessions = getSessions();
    const sessionIndex = sessions.findIndex((s) => s.id === currentSessionId);
    if (sessionIndex > -1) {
      sessions[sessionIndex] = {
        ...sessions[sessionIndex],
        name: sessionName,
        history: versionHistory,
      };
    } else {
      currentSessionId = Date.now();
      sessions.push({
        id: currentSessionId,
        name: sessionName,
        history: versionHistory,
      });
    }
    saveSessions(sessions);
    saveSessionActionBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
    setTimeout(() => {
      saveSessionActionBtn.innerHTML = '<i class="fas fa-save"></i> Save';
      closePopup(saveSessionPopup);
    }, 1500);
  }

  function loadSelectedSession() {
    const sessionId = sessionSelect.value;
    if (!sessionId) return alert("Please select a session.");
    const session = getSessions().find((s) => s.id === Number(sessionId));
    if (session) {
      versionHistory = session.history;
      currentSessionId = session.id;
      updateVersionHistoryUI();
      if (versionHistory.length > 0) loadVersion(versionHistory.length - 1);
      showModificationPanel();
      closePopup(loadSessionPopup);
      if (window.innerWidth <= 768) closeSidebar();
    }
  }

  function deleteSelectedSession() {
    const sessionId = sessionSelect.value;
    if (!sessionId || !confirm("Delete this session?")) return;
    saveSessions(getSessions().filter((s) => s.id !== Number(sessionId)));
    populateSessionDropdown();
    if (currentSessionId === Number(sessionId)) startNewSession();
  }

  function startNewSession() {
    versionHistory = [];
    promptHistory = [];
    currentSessionId = null;
    sessionNameInput.value = "";
    promptInput.value = "";
    modificationInput.value = "";
    clientSideAssets.forEach((asset) => URL.revokeObjectURL(asset.blobUrl));
    clientSideAssets.clear();
    renderSelectedFiles(generateFileList);
    renderSelectedFiles(modifyFileList);
    codeEditor.value = "";
    updateIframe("");
    clearInfoPanels();
    initialGenerationPanel.classList.remove("hidden");
    modificationPanel.classList.add("hidden");
    followupFloat.classList.remove("show");
    versionHistoryControls.classList.add("hidden");
    closePopup(loadSessionPopup);
    if (window.innerWidth <= 768) closeSidebar();
  }

  saveSessionActionBtn.addEventListener("click", saveCurrentSession);
  loadSessionActionBtn.addEventListener("click", loadSelectedSession);
  deleteSessionBtn.addEventListener("click", deleteSelectedSession);
  newSessionBtn.addEventListener("click", startNewSession);

  // --- Popups and Mobile Menu ---
  function openPopup(popup) {
    popup.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
  function closePopup(popup) {
    popup.classList.add("hidden");
    document.body.style.overflow = "";
  }
  loadSessionPopupClose.addEventListener("click", () =>
    closePopup(loadSessionPopup)
  );
  saveSessionPopupClose.addEventListener("click", () =>
    closePopup(saveSessionPopup)
  );
  followupPopupClose.addEventListener("click", () => closePopup(followupPopup));
  [loadSessionPopup, saveSessionPopup, followupPopup].forEach((popup) => {
    popup.addEventListener("click", (e) => {
      if (e.target === popup || e.target.classList.contains("popup-overlay"))
        closePopup(popup);
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closePopup(loadSessionPopup);
      closePopup(saveSessionPopup);
      closePopup(followupPopup);
      if (window.innerWidth <= 768) closeSidebar();
    }
  });

  function initMobileMenu() {
    hamburgerBtn.addEventListener("click", toggleSidebar);
    sidebarOverlay.addEventListener("click", closeSidebar);
  }
  function toggleSidebar() {
    sidebar.classList.toggle("open");
    sidebarOverlay.classList.toggle("show");
    hamburgerBtn.classList.toggle("active");
  }
  function closeSidebar() {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
    hamburgerBtn.classList.remove("active");
  }
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) closeSidebar();
  });

  function initTheme() {
    const theme = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", theme);
    updateThemeIcon(theme);
  }
  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    updateThemeIcon(next);
  }
  function updateThemeIcon(theme) {
    themeToggle.querySelector("i").className =
      theme === "dark" ? "fas fa-sun" : "fas fa-moon";
  }
  themeToggle.addEventListener("click", toggleTheme);

  // Initial page load setup
  initTheme();
  initMobileMenu();
  populateSessionDropdown();
});
