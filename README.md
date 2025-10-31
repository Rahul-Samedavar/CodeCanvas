# CodeCanvas - AI Visual Intelligence Studio

**CodeCanvas** is an AI-powered platform that transforms natural language ideas into **interactive visual experiences** — from dynamic data visualizations and physics-based animations to complete web interfaces.  
It combines **Google Gemini** and **OpenAI (via Requesty)** to understand intent, reason about visuals, and generate expressive, browser-ready applications — all in real time.

---

## ✨ What CodeCanvas Does

CodeCanvas turns prompts into **interactive, explorable visual media** — not just static charts or generated code.  
You describe what you want to see, and it builds responsive HTML/CSS/JS visualizations that you can preview, refine, and export.

Examples include:
- Data-driven dashboards from uploaded CSV or Excel files  
- Animated educational visualizations and simulations  
- Artistic or generative motion graphics  
- Interactive games and demos  
- AI-generated web layouts and immersive web scenes  

---

## ✨ Core Features

### 🧠 Visual Intelligence
- **Natural Language to Visualization** – Describe the concept; CodeCanvas brings it to life.  
- **AI-Driven Reasoning** – Combines Gemini’s contextual reasoning with OpenAI’s precision.  
- **Prompt Iteration** – Adjust color palettes, animations, or logic through conversational refinements.  
- **File-Aware Generation** – Automatically interprets uploaded data (CSV, Excel, PDF) for visual use.

### 💻 Live Studio Environment
- **Instant Preview** – Real-time sandbox execution inside an isolated iframe.  
- **Monaco Editor** – Edit generated visual logic directly, with syntax highlighting and formatting.  
- **Light/Dark Modes** – Seamless theme switching for creative work.  
- **Console Stream** – Live JavaScript console output for transparency and debugging.

### 🗂️ Session & Project Management
- **Save and Resume Sessions** – Every experiment is preserved locally.  
- **Version History** – Navigate through iterations and visual evolution.  
- **Asset Management** – Handle uploaded images, datasets, and resources.  
- **One-Click Export** – Download the entire visual experience as a shareable ZIP.

---

## ⚙️ Technology Stack

### Backend
- **FastAPI** – High-performance Python framework.  
- **Google Generative AI (Gemini)** – Primary model for reasoning and generation.  
- **OpenAI (via Requesty)** – Secondary fallback for robustness.  
- **Pydantic** – For configuration and validation.  
- **File Processing Engine** – Handles PDF, CSV, and Excel parsing.  
- **CORS-Enabled** – Safe and cross-origin ready.

### Frontend
- **Vanilla JavaScript + Monaco Editor** – Lightweight yet powerful environment.  
- **IndexedDB Storage** – Persistent client-side project sessions.  
- **Glassmorphism UI** – Clean, minimal, modern visual style.  
- **Responsive Grid Layout** – Optimized for all devices.

---

## 🧩 Installation

### Prerequisites
- Python 3.8+  
- Node.js (optional, for frontend development)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Rahul-Samedavar/CodeCanvas.git
   cd CodeCanvas
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Create environment configuration (create .env file)**
   ```env
   # Google Gemini Configuration (Primary)
   GEMINI_API_KEYS=your_gemini_key1,your_gemini_key2
   PRIMARY_AI_MODEL_NAME=gemini-2.5-flash

   # Requesty/OpenAI Configuration (Fallback)
   REQUESTY_API_KEY=your_requesty_api_key
   AI_MODEL_NAME=coding/gemini-2.5-flash
   ```

4. **Run the application**
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

5. **Launch CodeCanvas**
   Visit **http://localhost:8000**

---


## 📁 File & Asset Handling

| Type | Supported Formats | Purpose |
|------|-------------------|----------|
| Text | `.txt`, `.md`, `.json` | Descriptive or configuration data |
| Documents | `.pdf` | Extracts textual content |
| Spreadsheets | `.csv`, `.xlsx`, `.xls` | Data visualization sources |
| Images | `.png`, `.jpg`, `.jpeg`, `.svg`, `.gif` | Visual or UI elements |
| Others | Binary assets | Included in exports |

Assets are referenced automatically via blob URLs and packaged in downloadable projects.

---

## 🧱 Architecture Overview

```
CodeCanvas/
├── main.py              # FastAPI app and API endpoints
├── config.py            # Pydantic-based configuration
├── model_managers.py    # AI model orchestration (Gemini + Requesty)
├── file_processor.py    # PDF, CSV, Excel parsing and processing
├── models.py            # API request/response models
├── prompts.py           # LLM prompt and response templates
├── requirements.txt     # Python dependencies
├── .env                 # Environment configuration
└── static/              # Frontend files
    └── index.html  
    └── style.css  
    └── script.js

```

### AI Execution Flow
1. **Primary reasoning** via Google Gemini for understanding and generation.  
2. **Fallback handling** via OpenAI (Requesty) if Gemini fails or times out.  
3. **Adaptive prompt construction** for structured visual outputs.  
4. **Safe rendering sandbox** ensures browser isolation.

---

## 🎨 Example Use Cases

| Prompt | Output Type |
|--------|--------------|
| “Visualize population growth from my CSV as an animated timeline.” | Interactive data visualization |
| “Create a solar system simulation with orbital paths.” | Educational physics simulation |
| “Design an interactive color theory wheel.” | UI/UX visual tool |
| “Make a relaxing particle animation that responds to cursor movement.” | Generative art scene |
|"Create a cool breakout game. use the provided audio as BGM."| Game with Assets|
---

## 🔒 Security & Reliability

- **Iframe sandbox** for safe visual rendering.  
- **Strict request validation** with Pydantic.  
- **API key rotation** for Gemini.  
- **Resilient fallback logic** between AI providers.  
- **CORS protection** for controlled access.

---

## 🧑‍💻 Development & Contribution

- Fork the repo and explore modular back-end design.  
- Extend visual capabilities or add new model adapters.  
- Keep `.env` excluded from version control.  
- Contributions and feature ideas are welcome!

---

## ✨ Tagline

**CodeCanvas** — *Where imagination becomes interactive.*