document.addEventListener("DOMContentLoaded", () => {
  // --- Element Selectors ---
  const promptInput = document.getElementById("prompt-input")
  const generateBtn = document.getElementById("generate-btn")
  const modificationInput = document.getElementById("modification-input")
  const modifyBtn = document.getElementById("modify-btn")
  const downloadBtn = document.getElementById("download-btn")
  const openTabBtn = document.getElementById("open-tab-btn")
  const copyCodeBtn = document.getElementById("copy-code-btn")

  const togglePreviewBtn = document.getElementById("toggle-preview-btn")
  const toggleCodeBtn = document.getElementById("toggle-code-btn")
  const refreshPreviewBtn = document.getElementById("refresh-preview-btn")

  const codeContainer = document.querySelector(".code-container")
  const previewContainer = document.querySelector(".preview-container")
  const codeEditor = document.getElementById("code-editor")
  const gameIframe = document.getElementById("game-iframe")

  const initialGenerationPanel = document.getElementById("initial-generation")
  const modificationPanel = document.getElementById("modification-panel")
  const spinner = document.querySelector(".spinner-container")

  const analysisContainer = document.getElementById("analysis-container")
  const aiAnalysis = document.getElementById("ai-analysis")
  const changesContainer = document.getElementById("changes-container")
  const summaryOfChanges = document.getElementById("summary-of-changes")
  const instructionsContainer = document.getElementById("instructions-container")
  const gameInstructions = document.getElementById("game-instructions")

  const consoleContainer = document.getElementById("console-container")
  const consoleOutput = document.getElementById("console-output")

  const followUpInput = document.getElementById("follow-up-input")
  const followUpBtn = document.getElementById("follow-up-btn")
  const followUpSpinner = document.getElementById("follow-up-spinner")
  const followUpOutputContainer = document.getElementById("follow-up-output-container")
  const followUpOutput = document.getElementById("follow-up-output")

  const versionHistoryControls = document.getElementById("version-history-controls")
  const versionHistorySelect = document.getElementById("version-history-select")

  const loadSessionBtn = document.getElementById("load-session-btn")
  const saveSessionBtn = document.getElementById("save-session-btn")
  const loadSessionPopup = document.getElementById("load-session-popup")
  const saveSessionPopup = document.getElementById("save-session-popup")
  const loadSessionPopupClose = document.getElementById("load-session-popup-close")
  const saveSessionPopupClose = document.getElementById("save-session-popup-close")

  const followupFloat = document.getElementById("followup-float")
  const followupBtn = document.getElementById("followup-btn")
  const followupPopup = document.getElementById("followup-popup")
  const followupPopupClose = document.getElementById("followup-popup-close")

  // Session Management Selectors
  const sessionSelect = document.getElementById("session-select")
  const sessionNameInput = document.getElementById("session-name-input")
  const loadSessionActionBtn = document.getElementById("load-session-action-btn")
  const saveSessionActionBtn = document.getElementById("save-session-action-btn")
  const deleteSessionBtn = document.getElementById("delete-session-btn")
  const newSessionBtn = document.getElementById("new-session-btn")

  const hamburgerBtn = document.getElementById("hamburger-btn")
  const sidebar = document.getElementById("sidebar")
  const sidebarOverlay = document.getElementById("sidebar-overlay")

  // Theme Toggle
  const themeToggle = document.getElementById("theme-toggle")

  // --- State Variables ---
  let promptHistory = []
  let consoleLogs = []
  let abortController = null
  let versionHistory = []
  let currentSessionId = null
  const SESSIONS_STORAGE_KEY = "CodeCanvasSessions"

  function initMobileMenu() {
    hamburgerBtn.addEventListener("click", toggleSidebar)
    sidebarOverlay.addEventListener("click", closeSidebar)

    // Close sidebar when clicking on sidebar content on mobile
    sidebar.addEventListener("click", (e) => {
      if (window.innerWidth <= 768 && !e.target.closest(".panel")) {
        closeSidebar()
      }
    })
  }

  function toggleSidebar() {
    sidebar.classList.toggle("open")
    sidebarOverlay.classList.toggle("show")
    hamburgerBtn.classList.toggle("active")
  }

  function closeSidebar() {
    sidebar.classList.remove("open")
    sidebarOverlay.classList.remove("show")
    hamburgerBtn.classList.remove("active")
  }

  // Close sidebar on window resize if mobile
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      closeSidebar()
    }
  })

  function initParticleBackground() {
    const canvas = document.getElementById("particle-canvas")
    const ctx = canvas.getContext("2d")

    function resizeCanvas() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)

    const particles = []
    const particleCount = 50

    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width
        this.y = Math.random() * canvas.height
        this.vx = (Math.random() - 0.5) * 0.5
        this.vy = (Math.random() - 0.5) * 0.5
        this.size = Math.random() * 2 + 1
        this.opacity = Math.random() * 0.5 + 0.2
      }

      update() {
        this.x += this.vx
        this.y += this.vy

        if (this.x < 0 || this.x > canvas.width) this.vx *= -1
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1
      }

      draw() {
        ctx.save()
        ctx.globalAlpha = this.opacity
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--primary")
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle())
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particles.forEach((particle) => {
        particle.update()
        particle.draw()
      })

      // Draw connections
      particles.forEach((particle, i) => {
        particles.slice(i + 1).forEach((otherParticle) => {
          const dx = particle.x - otherParticle.x
          const dy = particle.y - otherParticle.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < 100) {
            ctx.save()
            ctx.globalAlpha = ((100 - distance) / 100) * 0.2
            ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--primary")
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(particle.x, particle.y)
            ctx.lineTo(otherParticle.x, otherParticle.y)
            ctx.stroke()
            ctx.restore()
          }
        })
      })

      requestAnimationFrame(animate)
    }

    animate()
  }

  function openPopup(popup) {
    popup.classList.remove("hidden")
    document.body.style.overflow = "hidden"
  }

  function closePopup(popup) {
    popup.classList.add("hidden")
    document.body.style.overflow = ""
  }

  loadSessionBtn.addEventListener("click", () => {
    populateSessionDropdown()
    openPopup(loadSessionPopup)
  })
  saveSessionBtn.addEventListener("click", () => openPopup(saveSessionPopup))

  loadSessionPopupClose.addEventListener("click", () => closePopup(loadSessionPopup))
  saveSessionPopupClose.addEventListener("click", () => closePopup(saveSessionPopup))

  // Follow-up popup event listeners
  followupBtn.addEventListener("click", () => openPopup(followupPopup))
  followupPopupClose.addEventListener("click", () => closePopup(followupPopup))

  loadSessionPopup.addEventListener("click", (e) => {
    if (e.target === loadSessionPopup || e.target.classList.contains("popup-overlay")) {
      closePopup(loadSessionPopup)
    }
  })

  saveSessionPopup.addEventListener("click", (e) => {
    if (e.target === saveSessionPopup || e.target.classList.contains("popup-overlay")) {
      closePopup(saveSessionPopup)
    }
  })

  followupPopup.addEventListener("click", (e) => {
    if (e.target === followupPopup || e.target.classList.contains("popup-overlay")) {
      closePopup(followupPopup)
    }
  })

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closePopup(loadSessionPopup)
      closePopup(saveSessionPopup)
      closePopup(followupPopup)
      if (window.innerWidth <= 768) {
        closeSidebar()
      }
    }
  })

  // --- Theme Management ---
  function initTheme() {
    const savedTheme = localStorage.getItem("theme") || "light"
    document.documentElement.setAttribute("data-theme", savedTheme)
    updateThemeIcon(savedTheme)
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme")
    const newTheme = currentTheme === "dark" ? "light" : "dark"
    document.documentElement.setAttribute("data-theme", newTheme)
    localStorage.setItem("theme", newTheme)
    updateThemeIcon(newTheme)
  }

  function updateThemeIcon(theme) {
    const icon = themeToggle.querySelector("i")
    icon.className = theme === "dark" ? "fas fa-sun" : "fas fa-moon"
  }

  themeToggle.addEventListener("click", toggleTheme)

  // --- Core Functions ---
  function cleanHtml(htmlString) {
    return htmlString
      .replace(/^```html\s*/, "")
      .replace(/\s*```$/, "")
      .trim()
  }

  const marked = window.marked // Declare the marked variable

  async function streamResponse(url, body, targetElement) {
    setLoading(true, url)
    if (url !== "/explain") {
      setView("preview")
      codeEditor.value = ""
      clearInfoPanels()
    }
    let currentFullText = ""
    if (abortController) abortController.abort()
    abortController = new AbortController()
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortController.signal,
      })
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        currentFullText += chunk
        if (targetElement) {
          targetElement.innerHTML = marked.parse(currentFullText)
        } else {
          updateUIFromStream(currentFullText)
        }
      }
      if (url !== "/explain") {
        const finalData = parseFullResponse(currentFullText)
        updateIframe(finalData.html)
        saveVersion({ ...finalData, prompt: body.prompt })
        showModificationPanel()
      }
    } catch (error) {
      if (error.name === "AbortError") console.log("Fetch aborted.")
      else {
        console.error("Streaming failed:", error)
        if (url !== "/explain") {
          codeEditor.value = `Error: Failed to get response. Check console.`
          setView("code")
        } else {
          followUpOutput.textContent = "Error: Could not get response."
        }
      }
    } finally {
      setLoading(false, url)
      abortController = null
    }
  }

  function parseFullResponse(fullText) {
    const result = { analysis: "", changes: "", instructions: "", html: "" }
    const analysisMatch = fullText.match(/\[ANALYSIS\]([\s\S]*?)\[END_ANALYSIS\]/)
    if (analysisMatch) result.analysis = analysisMatch[1].trim()
    const changesMatch = fullText.match(/\[CHANGES\]([\s\S]*?)\[END_CHANGES\]/)
    if (changesMatch) result.changes = changesMatch[1].trim()
    const instructionsMatch = fullText.match(/\[INSTRUCTIONS\]([\s\S]*?)\[END_INSTRUCTIONS\]/)
    if (instructionsMatch) result.instructions = instructionsMatch[1].trim()
    const htmlStartIndex = fullText.indexOf("[END_INSTRUCTIONS]")
    if (htmlStartIndex !== -1) {
      const potentialHtml = fullText.substring(htmlStartIndex + "[END_INSTRUCTIONS]".length).trim()
      if (potentialHtml.startsWith("<!DOCTYPE html>") || potentialHtml.startsWith("<html")) {
        result.html = cleanHtml(potentialHtml)
      }
    }
    return result
  }

  function updateUIFromStream(fullText) {
    const { analysis, changes, instructions, html } = parseFullResponse(fullText)
    if (analysis) {
      analysisContainer.classList.remove("hidden")
      analysisContainer.open = true
      aiAnalysis.innerHTML = marked.parse(analysis)
    }
    if (changes) {
      changesContainer.classList.remove("hidden")
      changesContainer.open = true
      summaryOfChanges.innerHTML = marked.parse(changes)
    }
    if (instructions) {
      instructionsContainer.classList.remove("hidden")
      gameInstructions.innerHTML = marked.parse(instructions)
      instructionsContainer.open = true
    }
    if (html) {
      codeEditor.value = html
    } else if (fullText.includes("[END_INSTRUCTIONS]")) {
      codeEditor.value = "Waiting for HTML code..."
    }
  }

  // --- Version History Functions ---
  function saveVersion(versionData) {
    const currentVersionIndex = versionHistory.findIndex((v) => v.prompt === promptHistory[promptHistory.length - 1])
    if (currentVersionIndex > -1 && currentVersionIndex < versionHistory.length - 1) {
      versionHistory = versionHistory.slice(0, currentVersionIndex + 1)
    }

    versionHistory.push(versionData)
    promptHistory = versionHistory.map((v) => v.prompt)
    updateVersionHistoryUI()
  }

  function updateVersionHistoryUI() {
    if (versionHistory.length > 0) {
      versionHistoryControls.classList.remove("hidden")
    } else {
      versionHistoryControls.classList.add("hidden")
    }

    versionHistorySelect.innerHTML = ""
    versionHistory.forEach((version, index) => {
      const option = document.createElement("option")
      option.value = index
      const promptSnippet = version.prompt.length > 50 ? version.prompt.substring(0, 47) + "..." : version.prompt
      option.textContent = `V${index + 1}: ${promptSnippet}`
      versionHistorySelect.prepend(option)
    })

    versionHistorySelect.value = versionHistory.length - 1
  }

  function loadVersion(index) {
    const version = versionHistory[index]
    if (!version) return

    codeEditor.value = version.html || ""
    updateIframe(version.html || "")
    clearInfoPanels()

    if (version.analysis) {
      analysisContainer.classList.remove("hidden")
      aiAnalysis.innerHTML = marked.parse(version.analysis)
      analysisContainer.open = true
    }

    if (version.changes) {
      changesContainer.classList.remove("hidden")
      summaryOfChanges.innerHTML = marked.parse(version.changes)
      changesContainer.open = true
    }

    if (version.instructions) {
      instructionsContainer.classList.remove("hidden")
      gameInstructions.innerHTML = marked.parse(version.instructions)
      instructionsContainer.open = true
    }

    promptHistory = versionHistory.slice(0, index + 1).map((v) => v.prompt)
  }

  versionHistorySelect.addEventListener("change", (e) => {
    const selectedIndex = Number.parseInt(e.target.value, 10)
    loadVersion(selectedIndex)
  })

  // --- Session Management Functions ---
  function getSessions() {
    try {
      const sessions = localStorage.getItem(SESSIONS_STORAGE_KEY)
      return sessions ? JSON.parse(sessions) : []
    } catch (e) {
      console.error("Failed to parse sessions from localStorage:", e)
      return []
    }
  }

  function saveSessions(sessions) {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions))
  }

  function populateSessionDropdown() {
    const sessions = getSessions()
    sessionSelect.innerHTML = ""
    if (sessions.length === 0) {
      sessionSelect.innerHTML = '<option value="">No sessions saved</option>'
      return
    }
    sessions.forEach((session) => {
      const option = document.createElement("option")
      option.value = session.id
      option.textContent = session.name
      sessionSelect.appendChild(option)
    })
  }

  function saveCurrentSession() {
    const sessionName = sessionNameInput.value.trim()
    if (!sessionName) return alert("Please enter a name for your session.")
    if (versionHistory.length === 0) return alert("There is nothing to save.")

    const sessions = getSessions()
    const sessionIndex = sessions.findIndex((s) => s.id === currentSessionId)

    if (sessionIndex !== -1) {
      sessions[sessionIndex].name = sessionName
      sessions[sessionIndex].history = versionHistory
    } else {
      const newSession = { id: Date.now(), name: sessionName, history: versionHistory }
      sessions.push(newSession)
      currentSessionId = newSession.id
    }

    saveSessions(sessions)

    const originalText = saveSessionActionBtn.innerHTML
    saveSessionActionBtn.innerHTML = '<i class="fas fa-check"></i> Saved!'
    saveSessionActionBtn.style.background = "var(--success)"
    setTimeout(() => {
      saveSessionActionBtn.innerHTML = originalText
      saveSessionActionBtn.style.background = ""
      closePopup(saveSessionPopup)
      sessionNameInput.value = ""
    }, 1500)
  }

  function loadSelectedSession() {
    const sessionId = sessionSelect.value
    if (!sessionId) return alert("Please select a session to load.")
    const sessions = getSessions()
    const session = sessions.find((s) => s.id === Number.parseInt(sessionId))
    if (session) {
      versionHistory = session.history
      currentSessionId = session.id
      updateVersionHistoryUI()
      if (versionHistory.length > 0) {
        loadVersion(versionHistory.length - 1)
      }
      showModificationPanel()
      initialGenerationPanel.classList.add("hidden")

      closePopup(loadSessionPopup)
      if (window.innerWidth <= 768) {
        closeSidebar()
      }
    }
  }

  function deleteSelectedSession() {
    const sessionId = sessionSelect.value
    if (!sessionId) return alert("No session selected to delete.")
    if (!confirm("Are you sure you want to delete this session?")) return

    let sessions = getSessions()
    sessions = sessions.filter((s) => s.id !== Number.parseInt(sessionId))
    saveSessions(sessions)
    populateSessionDropdown()

    if (currentSessionId === Number.parseInt(sessionId)) {
      startNewSession()
    }
  }

  function startNewSession() {
    versionHistory = []
    promptHistory = []
    currentSessionId = null
    sessionNameInput.value = ""
    promptInput.value = ""
    modificationInput.value = ""

    codeEditor.value = ""
    updateIframe("")
    clearInfoPanels()

    initialGenerationPanel.classList.remove("hidden")
    modificationPanel.classList.add("hidden")
    followupFloat.classList.remove("show")
    versionHistoryControls.classList.add("hidden")

    closePopup(loadSessionPopup)
    if (window.innerWidth <= 768) {
      closeSidebar()
    }
  }

  // --- Event Handlers ---
  generateBtn.addEventListener("click", () => {
    const prompt = promptInput.value.trim()
    if (!prompt) return alert("Please enter an idea!")
    startNewSession()
    sessionNameInput.value = prompt.substring(0, 50) + (prompt.length > 50 ? "..." : "")
    streamResponse("/generate", { prompt })

    if (window.innerWidth <= 768) {
      closeSidebar()
    }
  })

  modifyBtn.addEventListener("click", () => {
    const prompt = modificationInput.value.trim()
    if (!prompt) return alert("Please describe your modification!")
    const newPromptHistory = [...promptHistory, prompt]
    const currentHtml = codeEditor.value
    if (!currentHtml) return alert("There is no code to modify!")
    const logs = consoleLogs.join("\n")
    streamResponse("/modify", {
      prompt,
      current_code: currentHtml,
      console_logs: logs,
      prompt_history: newPromptHistory,
    })

    if (window.innerWidth <= 768) {
      closeSidebar()
    }
  })

  followUpBtn.addEventListener("click", () => {
    const question = followUpInput.value.trim()
    if (!question) return alert("Please ask a question!")
    const currentHtml = codeEditor.value
    if (!currentHtml) return alert("There is no code to ask about!")
    followUpOutputContainer.classList.remove("hidden")
    followUpOutput.innerHTML = ""
    streamResponse("/explain", { question: question, current_code: currentHtml }, followUpOutput)
    // Don't close popup immediately to show the response
  })

  downloadBtn.addEventListener("click", () => {
    const html = codeEditor.value
    if (!html) return alert("No code to download!")
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "codecanvas_creation.html"
    a.click()
    URL.revokeObjectURL(url)
  })

  openTabBtn.addEventListener("click", () => {
    const html = codeEditor.value
    if (!html) return alert("No code to open!")
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank")
  })

  copyCodeBtn.addEventListener("click", async () => {
    const code = codeEditor.value
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      const originalContent = copyCodeBtn.innerHTML
      copyCodeBtn.innerHTML = '<i class="fas fa-check"></i> <span>Copied!</span>'
      copyCodeBtn.style.background = "var(--success)"
      setTimeout(() => {
        copyCodeBtn.innerHTML = originalContent
        copyCodeBtn.style.background = ""
      }, 2000)
    } catch (err) {
      console.error("Failed to copy text: ", err)
    }
  })

  refreshPreviewBtn.addEventListener("click", () => {
    updateIframe(codeEditor.value)
    setView("preview")
  })

  saveSessionActionBtn.addEventListener("click", saveCurrentSession)
  loadSessionActionBtn.addEventListener("click", loadSelectedSession)
  deleteSessionBtn.addEventListener("click", deleteSelectedSession)
  newSessionBtn.addEventListener("click", startNewSession)

  // --- UI Helper Functions ---
  function setView(view) {
    if (view === "preview") {
      previewContainer.classList.remove("hidden")
      codeContainer.classList.add("hidden")
      togglePreviewBtn.classList.add("active")
      toggleCodeBtn.classList.remove("active")
      refreshPreviewBtn.classList.add("hidden")
    } else {
      previewContainer.classList.add("hidden")
      codeContainer.classList.remove("hidden")
      togglePreviewBtn.classList.remove("active")
      toggleCodeBtn.classList.add("active")
      refreshPreviewBtn.classList.remove("hidden")
    }
  }

  togglePreviewBtn.addEventListener("click", () => setView("preview"))
  toggleCodeBtn.addEventListener("click", () => setView("code"))

  function updateIframe(htmlContent) {
    const consoleLoggerScript = `<script>
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
                    } catch (e) {}
                };
                window.console.log = (...args) => { postLog('log', args); originalConsole.log(...args); };
                window.console.error = (...args) => { postLog('error', args); originalConsole.error(...args); };
                window.console.warn = (...args) => { postLog('warn', args); originalConsole.warn(...args); };
                window.addEventListener('error', event => {
                    postLog('error', [event.message, 'at', event.filename + ':' + event.lineno]);
                });
            </script>`
    consoleLogs = []
    updateConsoleDisplay()
    gameIframe.srcdoc = consoleLoggerScript + htmlContent
  }

  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "console") {
      const { level, message } = event.data
      const logEntry = `[${level.toUpperCase()}] ${message}`
      consoleLogs.push(logEntry)
      updateConsoleDisplay()
    }
  })

  function updateConsoleDisplay() {
    if (consoleLogs.length > 0) {
      consoleContainer.classList.remove("hidden")
      consoleOutput.value = consoleLogs.join("\n")
      consoleOutput.scrollTop = consoleOutput.scrollHeight
    } else {
      consoleContainer.classList.add("hidden")
      consoleOutput.value = ""
    }
  }

  function setLoading(isLoading, url) {
    if (url === "/explain") {
      followUpSpinner.classList.toggle("hidden", !isLoading)
      followUpBtn.disabled = isLoading
    } else {
      spinner.classList.toggle("hidden", !isLoading)
      generateBtn.disabled = isLoading
      modifyBtn.disabled = isLoading
    }
  }

  function showModificationPanel() {
    initialGenerationPanel.classList.add("hidden")
    modificationPanel.classList.remove("hidden")
    followupFloat.classList.add("show")
  }

  function clearInfoPanels() {
    analysisContainer.classList.add("hidden")
    changesContainer.classList.add("hidden")
    instructionsContainer.classList.add("hidden")
    aiAnalysis.innerHTML = ""
    summaryOfChanges.innerHTML = ""
    gameInstructions.innerHTML = ""
  }

  // --- Initial Setup ---
  initTheme()
  initParticleBackground()
  initMobileMenu() // Initialize mobile menu
  populateSessionDropdown()

  // Add some nice entrance animations
  setTimeout(() => {
    document.querySelectorAll(".panel").forEach((panel, index) => {
      panel.style.animationDelay = `${index * 0.1}s`
    })
  }, 100)
})
