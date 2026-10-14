<p align="center">
  <img src="banner.png" alt="DIGI LABS - Free Multilingual & Urdu Voice Studio" width="100%">
</p>

# DIGI LABS: Free Desktop Voice & Media Studio (with Native Urdu Engine)
> **High-speed, zero-cost voice synthesis for creators, developers, and educators. Powered by Edge-TTS, Gemini 2.5 Flash, and Local Whisper.**

<p align="center">
  <a href="https://github.com/digiformationltd-creator/digi-labs/releases/download/v1.0.0/DIGI-LABS-Setup-1.0.0.exe">
    <img src="https://img.shields.io/badge/Download-Windows_Setup_(.exe_253MB)-00f5d4?style=for-the-badge&logo=windows&logoColor=black" alt="Download Windows Setup" />
  </a>
  <a href="https://github.com/digiformationltd-creator/digi-labs/releases/download/v1.0.0/DIGI-LABS-v1.0.0-win-unpacked.zip">
    <img src="https://img.shields.io/badge/Portable-ZIP_Build_(358MB)-a855f7?style=for-the-badge&logo=windows&logoColor=white" alt="Download Portable ZIP" />
  </a>
  <a href="https://www.digibizos.co.uk/open-source/digi-labs">
    <img src="https://img.shields.io/badge/Web_Portal-Documentation-7928ca?style=for-the-badge" alt="Portal & Docs" />
  </a>
  <img src="https://img.shields.io/badge/License-Source--Available-blue?style=for-the-badge" alt="License" />
</p>

---

## 🎧 Listen to Voice Samples (Urdu & English)

Hear the synthesis quality before downloading. Natural cadence, proper pronunciation, and clean audio across multiple male and female character variants:

| Vocal Preset | Engine | Language / Accent | Audio Profile |
| :--- | :--- | :--- | :--- |
| **اردو قدرتی بیانیہ (Urdu Natural Narration)** | Edge-TTS Neural | Urdu (Pakistan) | 🎙️ Clean narrative tone for audiobooks, stories & documentaries |
| **اردو مکالماتی و پوڈکاسٹ (Urdu Conversational)** | Edge-TTS Multi-Variant | Urdu (Pakistan) | 🎙️ Expressive conversational pacing with 1-click Nastaliq support |
| **English Expressive Storyteller** | Gemini 2.5 Flash Speech | English (Multilingual) | 🎙️ Realistic inflection, breathing pauses & cinematic depth |

---

## ⚡ What is DIGI LABS?

DIGI LABS is a standalone, frameless desktop workstation built on Electron, Node.js, and local FFmpeg. It is designed to bridge cutting-edge voice models with everyday creator workflows:

### 1. Dual Audio Synthesis Engines
- **Free Voice (Edge-TTS)**:
  - 100% Free, unlimited character generation with **zero API key requirement**.
  - Built-in support for **Urdu (اردو)** with a 1-click Nastaliq typography editor toggle.
  - Multiple male and female voice variants across 40+ global languages (English, Urdu, Hindi, Arabic, Spanish, French, etc.) ready out of the box.
- **Studio Voice (Google Gemini 2.5 Flash)**:
  - Deep emotional inflection, whispered cadences, multiple character personas, and human-like speech flow.
  - Connects securely using your own standard, free Google AI Studio API key.

### 2. Media Intelligence Engine
- **Video-to-Prompt Reverse Engineering**: Paste any video link to extract camera pacing, lighting setups, scene structures, and visual generation prompts for Sora, Runway Gen-3, Kling, or Midjourney.
- **Course & Summary Generator**: Automatically transform 1-hour lectures or webinars into modular, chapter-by-chapter courses and executive study notes.
- **Speech-to-Text Transcription**: Powered by local Whisper processing for timestamped transcription.

### 3. Built-in Audio Repair Studio
- **Audio Polish**: Apply local FFmpeg vocal filters: high-pass, low-pass, vocal normalization, and instant MP3/WAV export on your local SSD.

---

## 🚀 Quick Start Guide

### Option 1: Standalone Windows App (No Developer Setup Required)
1. Download **[DIGI-LABS-Setup-1.0.0.exe](https://github.com/digiformationltd-creator/digi-labs/releases/download/v1.0.0/DIGI-LABS-Setup-1.0.0.exe)** (253MB).
2. Run the installer. It launches directly from your Windows Start Menu.
3. Select your voice (e.g., Urdu or English), type or paste your script, and click **Generate**.
4. *(Optional)* For Studio Voice, open **Settings (⚙️)** and paste your free key from [Google AI Studio](https://aistudio.google.com/app/apikey).

### Option 2: Run From Source (Developers)
```bash
# Clone the repository
git clone https://github.com/digiformationltd-creator/digi-labs.git
cd digi-labs

# Install dependencies
npm install

# Launch Electron desktop workstation
npm start

# Or launch local web server UI (http://localhost:4300)
npm run server

# Build custom Windows NSIS installer
npm run dist
```

---

## 📦 System Requirements

| Specification | Minimum Requirement | Recommended |
|---|---|---|
| **Operating System** | Windows 10 (64-bit, 20H2+) | Windows 11 (64-bit, Latest Build) |
| **Processor** | Intel Core i5 / AMD Ryzen 5 | Intel Core i7 / AMD Ryzen 7 |
| **Memory (RAM)** | 4 GB RAM | 8 GB+ RAM |
| **Storage** | 500 MB free SSD storage | 2 GB free SSD storage |
| **Runtime (Source)**| Node.js 18+ & Python 3.10+ | Node.js 20+ & Python 3.11+ |
| **Installer (.exe)**| Self-contained (No Python or Node needed) | Self-contained installer |

---

## 🛠️ Architecture & Transparency

We believe in complete transparency about how DIGI LABS operates:
- **Speech Synthesis**: Microsoft Edge-TTS (unlimited free tier) + Google Gemini 2.5 Flash Audio (via user's own API key).
- **Audio Transcoding**: Static FFmpeg binaries bundled locally with the Electron shell.
- **Privacy**: No telemetry, no centralized recording of your text or generated audio. Everything stays on your local machine.

---

## ⚖️ License & Terms

DIGI LABS is released as a **Source-Available Free Application**:
- ✅ **100% Free For Personal & Commercial Content Creation**: Use it on your PC, agency workstations, and production rigs. Create commercial audiobooks, voiceovers, podcasts, and videos with total creative ownership.
- ❌ **No Software Reselling or Cloud Re-hosting**: You may not sell copies of this installer, white-label the software, or host it as a paid cloud SaaS subscription service.

---

## 🏢 Maintainers & Community

Maintained with ❤️ by **Digiformation Ltd** (UK Company # 16994903).  
- **Documentation & Web Portal:** [digibizos.co.uk/open-source/digi-labs](https://www.digibizos.co.uk/open-source/digi-labs)  
- **Bug Reports & Feature Requests:** Feel free to open an Issue or Pull Request on GitHub.
