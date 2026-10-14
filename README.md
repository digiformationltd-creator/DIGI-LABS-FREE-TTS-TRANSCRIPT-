<p align="center">
  <img src="banner.png" alt="DIGI LABS - Free Multilingual & Urdu Voice Studio" width="100%">
</p>

# DIGI LABS: Free Desktop Studio Voice & Media Workstation
> **Broadcast-grade human speech synthesis powered directly by Google Gemini 2.5 Flash Studio Voice, with unlimited offline Free Voice (Edge-TTS) and local Whisper transcription.**

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

## 🎙️ Flagship Engine: Google Gemini 2.5 Flash Studio Voice

DIGI LABS harnesses **Google Gemini 2.5 Flash Preview TTS (`gemini-2.5-flash-preview-tts`)** to generate authentic, human-grade voiceovers with true breath control, emotional dynamic range, and natural pauses.

- **Direct Studio PCM Audio**: Synthesizes uncompressed 24kHz 16-bit raw PCM audio directly from Google AI Studio, mastered to MP3/WAV via local FFmpeg.
- **5 Expressive Delivery Styles**:
  - `Normal` — Balanced, authentic narration for documentaries and audiobooks.
  - `Business` — Polished, confident corporate delivery for presentations and demos.
  - `Promo` — Energetic, high-impact hook delivery for short-form ads and reels.
  - `Explainer` — Friendly, clear instructional tone for tutorials and online courses.
  - `Calm` — Slow, soothing cadence for wellness and bedtime storytelling.
- **Diverse Character Timbers (Men & Women)**: Rich vocal presets (`Charon`, `Puck`, `Fenrir`, `Orus`, `Aoede`, `Kore`, etc.) covering varying resonance and pitches.
- **Direct Private BYOK**: Connects directly from your desktop to Google AI Studio with your own free API key. Zero cloud proxies, zero telemetry, and zero subscription fees.

---

## ⚡ Secondary Engine: Unlimited Free Voice (Edge-TTS)

For infinite long-form narration without an API key:
- **Zero API Key Required**: 100% free with unlimited character volume.
- **Native Urdu (اردو) & RTL Support**: Native Urdu accent with a 1-click Nastaliq typography editor toggle.
- **40+ Languages & Dialects**: English, Urdu, Hindi, Arabic, Spanish, French, German, and more with male and female voice variants.

---

## 🎬 Built-in Media Intelligence Workstation

Beyond voice synthesis, DIGI LABS provides three built-in media tools:

1. **Video-to-Prompt Reverse Engineering**: Paste any video link (YouTube, MP4) to extract camera motion cues, volumetric lighting setups, and production prompts for Sora, Runway Gen-3, Kling, or Midjourney.
2. **Automated Course & Note Generator**: Transform 1-hour lectures or webinars into modular syllabi, chapter-by-chapter student notes, and executive summaries automatically.
3. **Local Whisper Speech-to-Text**: Generate word-for-word timestamped subtitles and transcripts locally on your PC.

---

## 🚀 Quick Start Guide

### Option 1: Standalone Windows App (Recommended)
1. Download **[DIGI-LABS-Setup-1.0.0.exe](https://github.com/digiformationltd-creator/digi-labs/releases/download/v1.0.0/DIGI-LABS-Setup-1.0.0.exe)** (253MB).
2. Run the installer. It launches directly from your Windows Start Menu.
3. In **Settings (⚙️)**, paste your free API key from [Google AI Studio](https://aistudio.google.com/app/apikey) for Studio Voice.
4. Select your voice and emotional style, paste your script, and click **Generate**.

### Option 2: Run From Source (Developers)
```bash
# Clone the repository
git clone https://github.com/digiformationltd-creator/digi-labs.git
cd digi-labs

# Install dependencies
npm install

# Launch Electron desktop workstation
npm start

# Or launch local server UI (http://localhost:4300)
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

- **Primary Studio Engine**: Google Gemini 2.5 Flash Audio (`gemini-2.5-flash-preview-tts`) connecting directly via user's private Google AI Studio API key.
- **Secondary Fallback Engine**: Microsoft Edge-TTS for unlimited offline zero-key narrations.
- **Audio Processing**: Bundled local static FFmpeg for 24kHz raw PCM transcoding and loudness normalization.
- **Privacy Guarantee**: Zero tracking, zero telemetry, and zero middleman servers. All scripts and audio files stay strictly on your local PC.

---

## ⚖️ License & Terms

DIGI LABS is released as a **Source-Available Free Application**:
- ✅ **100% Free For Personal & Commercial Production**: Generate unlimited commercial audiobooks, client voiceovers, YouTube videos, and podcasts. You keep 100% of your earnings.
- ❌ **No Software Reselling or Cloud Re-hosting**: You may not sell copies of this installer, white-label the application, or host it as a paid cloud SaaS subscription service.

---

## 🏢 Maintainers & Community

Maintained with ❤️ by **Digiformation Ltd** (UK Company # 16994903).  
- **Documentation & Web Portal:** [digibizos.co.uk/open-source/digi-labs](https://www.digibizos.co.uk/open-source/digi-labs)  
- **Issues & Contributions:** Feel free to open an Issue or Pull Request on GitHub.
