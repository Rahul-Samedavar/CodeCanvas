# CodeCanvas - AI Code Generation Studio

CodeCanvas is a powerful web-based platform that uses AI to generate interactive HTML visualizations, games, and web applications from natural language descriptions. The platform supports both Google Gemini and OpenAI models, providing a robust development experience with real-time preview, code editing, and session management.

## Features

### Core Functionality
- **AI Code Generation**: Generate complete HTML/CSS/JS applications from natural language prompts
- **Real-time Preview**: Live preview with iframe sandbox for safe execution
- **Interactive Modification**: Iteratively improve generated code with follow-up prompts
- **Multi-Model Support**: Primary support for Google Gemini with OpenAI fallback via Requesty
- **File Upload Support**: Upload and process various file types (TXT, PDF, CSV, XLSX, images)

### Code Editor
- **Monaco Editor Integration**: Professional code editor with syntax highlighting
- **Theme Support**: Light and dark themes
- **Code Formatting**: Auto-formatting and bracket matching
- **Copy to Clipboard**: Easy code sharing

### Session Management
- **Session Persistence**: Save and load complete work sessions
- **Version History**: Track multiple iterations of your project
- **Asset Management**: Handle uploaded files and project assets
- **Export Options**: Download individual HTML files or complete project ZIP files

### User Experience
- **Responsive Design**: Mobile-friendly interface with collapsible sidebar
- **Live Console**: Real-time JavaScript console output from generated applications
- **AI Assistance**: Ask follow-up questions about generated code
- **Progress Tracking**: Visual feedback during code generation

## Technology Stack

### Backend
- **FastAPI**: High-performance Python web framework
- **Google Generative AI**: Primary AI model integration
- **OpenAI API**: Fallback AI model via Requesty
- **File Processing**: Support for PDF, Excel, CSV parsing
- **CORS Support**: Cross-origin resource sharing enabled

### Frontend
- **Vanilla JavaScript**: No framework dependencies
- **Monaco Editor**: Professional code editor
- **IndexedDB**: Client-side session storage
- **Glassmorphism UI**: Modern design with backdrop blur effects
- **Responsive CSS Grid**: Adaptive layout system

## Installation

### Prerequisites
- Python 3.8+
- Node.js (for development dependencies)

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/Rahul-Samedavar/CodeCanvas.git
   cd CodeCanvas
   ```

2. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Environment Configuration**
   Create a `.env` file in the root directory:
   ```env
   # Google Gemini Configuration (Primary)
   GEMINI_API_KEYS=your_gemini_key1,your_gemini_key2
   PRIMARY_AI_MODEL_NAME=gemini-1.5-flash-latest
   
   # Requesty/OpenAI Configuration (Fallback)
   REQUESTY_API_KEY=your_requesty_api_key
   AI_MODEL_NAME=gemini-1.5-pro-latestr
   ```

4. **Run the application**
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

5. **Access the application**
   Open your browser to `http://localhost:8000`

## Configuration Options

### AI Model Settings
- **PRIMARY_AI_MODEL_NAME**: Primary Gemini model (default: `gemini-1.5-flash-latest`)
- **AI_MODEL_NAME**: Fallback model name (default: `gemini-1.5-pro-latest`)
- **GEMINI_API_KEYS**: Comma-separated list of Gemini API keys for load balancing
- **REQUESTY_API_KEY**: Requesty API key for OpenAI fallback

### Server Settings
- **CORS_ALLOW_ORIGINS**: Allowed origins for CORS (default: `*`)
- **STATIC_DIR**: Directory for static files (default: `static`)
- **REQUESTY_SITE_URL**: Site URL for Requesty headers
- **REQUESTY_SITE_NAME**: Site name for Requesty headers

## API Endpoints

### Core Generation
- `POST /generate`: Generate new code from prompt and files
- `POST /modify`: Modify existing code with new requirements
- `POST /explain`: Ask questions about generated code

### Utility
- `POST /download_zip`: Create downloadable project ZIP
- `GET /healthz`: Health check endpoint
- `GET /`: Serve main application interface

## File Support

### Supported Upload Types
- **Text Files**: `.txt`, `.md`, `.py`, `.js`, `.html`, `.css`, `.json`
- **Documents**: `.pdf` (with text extraction)
- **Spreadsheets**: `.csv`, `.xlsx`, `.xls`
- **Images**: All common formats (referenced in generated code)
- **Other**: Binary files supported as assets

### Asset Handling
- Client-side asset management with blob URLs
- Automatic path resolution in generated code
- Asset bundling in downloadable projects

## Usage Examples

### Basic Code Generation
1. Enter a prompt: "Create a bouncing ball animation with gravity"
2. Upload any reference images or data files
3. Click "Generate Code"
4. View live preview and iterate with modifications

### Advanced Workflows
1. **Data Visualization**: Upload CSV data and ask for interactive charts
2. **Game Development**: Create simple games with physics and animations
3. **Interactive Demos**: Build educational content with user interactions
4. **Landing Pages**: Generate responsive marketing pages

### Session Management
1. **Save Sessions**: Preserve your work with version history
2. **Load Sessions**: Resume previous projects with all assets
3. **Export Projects**: Download complete projects as ZIP files

## Architecture

### Multi-Model Strategy
The application implements a sophisticated AI model management system:

1. **Primary**: Google Gemini models with API key rotation
2. **Fallback**: OpenAI models via Requesty service
3. **Error Handling**: Graceful degradation between model providers

### Response Processing
AI responses follow a structured format:
- `[ANALYSIS]...[END_ANALYSIS]`: AI reasoning process
- `[CHANGES]...[END_CHANGES]`: Summary of modifications
- `[INSTRUCTIONS]...[END_INSTRUCTIONS]`: User guidance
- **HTML Code**: Complete, executable application code

### Security Features
- **Iframe Sandbox**: Safe execution of generated code
- **CORS Protection**: Configurable origin restrictions
- **Input Validation**: Request validation with Pydantic
- **Error Isolation**: Robust error handling and recovery

## Development

### Project Structure
```
codecanvas/
├── main.py              # FastAPI application and AI integration
├── requirements.txt     # Python dependencies
├── static/
│   ├── index.html      # Main application interface
│   ├── style.css       # UI styles and responsive design
│   └── script.js       # Frontend logic and API integration
└── .env                # Environment configuration
```

### Key Components
- **MultiModelManager**: Handles AI model selection and fallback
- **Session Management**: IndexedDB-based persistence
- **Asset Pipeline**: Client-side file handling and processing
- **Monaco Editor**: Professional code editing experience