<p align="center">
  <img src="banner.png" alt="DIGI LABS - Free TTS (Text-to-Speech) & Human Voice Studio" width="100%">
</p>

# DIGI LABS: Free TTS (Text-to-Speech) & Human Voice Studio
> **Broadcast-grade Free Text-to-Speech (TTS) powered 100% by Google Gemini 2.5 Flash Studio Voice, with built-in Video-to-Prompt reverse engineering and local Whisper transcription.**

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

## 🎯 Who Is DIGI LABS Built For?

DIGI LABS is engineered specifically for creators, businesses, and educators who need authentic human audio without the punishing $22–$99/month subscription fees and character caps of commercial TTS platforms:

- 🎬 **Content Creators, YouTubers & Reel Makers**: Perfect for faceless YouTube channels, TikTok/Instagram reels, and documentary creators who want high-production-value human voiceovers without needing an expensive microphone, soundproof studio, or recording their own voice.
- 💼 **Business Marketers & Agency Owners**: Generate confident corporate voiceovers for product launch videos, software demos, pitch decks, and high-impact social media ads using the dedicated `Business` and `Promo` vocal delivery styles.
- 🎙️ **Urdu Creators & Regional Storytellers**: Specially tailored for creators who need expressive, culturally nuanced Urdu speech synthesis with natural cadence, paired with an instant 1-click **RTL Nastaliq typography editor** for effortless script writing.
- 📚 **Audiobook Authors & Podcasters**: Convert entire book chapters, articles, and long-form literature into smooth, broadcast-ready MP3s with natural breathing pauses, avoiding the mechanical monotony of traditional text-to-speech.
- 🎓 **Educators & Online Course Creators**: Transform written lecture notes, training manuals, and syllabi into engaging instructional voice tracks using the clear, unhurried `Explainer` delivery tone.
- ⚡ **Indie Hackers & Media Producers**: Combine human voiceover with our built-in **Video-to-Prompt Engine** to reverse-engineer viral videos, extract production cues for Sora/Runway, and produce complete multimedia content for $0.

---

## 🎙️ 100% Authentic Human Voice (Google Gemini 2.5 Flash Free TTS)

Traditional mechanical text-to-speech (TTS) engines sound flat, robotic, and lifeless. **DIGI LABS is powered exclusively by Google Gemini 2.5 Flash Studio Voice (`gemini-2.5-flash-preview-tts`)** — generating rich, emotionally dynamic human speech.

Every voice track is synthesized with realistic breathing pauses, natural pitch variation, and authentic human cadence directly from your desktop.

### Key Free TTS Features:
- **Direct Studio PCM Audio**: Synthesizes uncompressed 24kHz 16-bit raw PCM audio directly from Google AI Studio, mastered locally to 192kbps MP3 via bundled static FFmpeg.
- **5 Expressive Delivery Styles**:
  - `Normal` *(Default)* — Natural, authentic narration for audiobooks, documentaries, and long-form scripts.
  - `Business` — Polished, confident corporate delivery for brand presentations and client demos.
  - `Promo` — Energetic, high-impact hook delivery for viral shorts, reels, and ads.
  - `Explainer` — Friendly, clear instructional tone for tutorials and educational courses.
  - `Calm` — Soothing, slow cadence for bedtime stories and mindfulness content.
- **Studio Character Presets**: Distinct vocal profiles (`Charon` — deep & steady, `Puck` — bright & lively, `Fenrir` — weighty & serious, `Orus` — warm & even) covering diverse resonance, cadence, and depth.
- **Intelligent Sentence-Safe Splicing**: Long passages are automatically segmented at natural punctuation pauses (`. `, `۔`, `!`, `?`, `\n`) up to 2,500 characters, rendered, and seamlessly joined via FFmpeg without cutting words mid-sentence.
- **Private Direct BYOK**: Connects directly from your PC to Google AI Studio with your own free API key. Zero cloud middleman, zero proxies, zero telemetry, and zero subscription taxes.

---

## 🎬 Built-in Media Intelligence Workstation

Beyond human text-to-speech (TTS), DIGI LABS features an integrated multimedia reverse-engineering suite:

1. **Video-to-Prompt Reverse Engineering**: Paste any video link (YouTube, MP4) to extract camera motion cues, volumetric lighting setups, and production prompts for Sora, Runway Gen-3, Kling, or Midjourney.
2. **Automated Course & Note Generator**: Transform 1-hour lectures or webinars into modular syllabi, chapter-by-chapter student notes, and executive summaries automatically.
3. **Local Whisper Speech-to-Text**: Generate word-for-word timestamped subtitles and transcripts locally on your PC.
4. **Urdu & RTL Typography Support**: Instant 1-click Nastaliq typography editor toggle for regional creators and localization.

---

## 🚀 Quick Start Guide

### Option 1: Standalone Windows App (Recommended)
1. Download **[DIGI-LABS-Setup-1.0.0.exe](https://github.com/digiformationltd-creator/digi-labs/releases/download/v1.0.0/DIGI-LABS-Setup-1.0.0.exe)** (253MB).
2. Run the installer. It launches directly from your Windows Start Menu.
3. In **Settings (⚙️)**, paste your free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
4. Select your voice and delivery style, type or paste your script, and click **Generate Voice**.

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

- **Voice Synthesis**: Exclusively powered by Google Gemini 2.5 Flash Audio (`gemini-2.5-flash-preview-tts`) connecting directly via user's private Google AI Studio API key. Robotic/mechanical TTS engines are strictly disabled in production.
- **Audio Transcoding**: Bundled local static FFmpeg for 24kHz raw PCM transcoding and loudness normalization.
- **Media Intelligence**: High-speed Cloudflare Workers AI + optional local Whisper STT.
- **Privacy Guarantee**: Zero tracking, zero telemetry, and zero middleman servers. All scripts and audio files stay strictly on your local PC.

---

## ⚖️ License & Terms

DIGI LABS is released as a **Source-Available Free Application**:
- ✅ **100% Free For Personal & Commercial Production**: Generate unlimited commercial audiobooks, client voiceovers, YouTube videos, and podcasts. You keep 100% of your earnings.
- ❌ **No Software Reselling or Cloud Re-hosting**: You may not sell copies of this installer, white-label the application, or host it as a paid cloud SaaS subscription service.

---

## 🏢 Maintainers & Community

**DIGI LABS** is engineered, maintained, and open-sourced by **DIGIFORMATION LTD** — a registered UK corporate entity providing autonomous agentic AI architecture and sovereign digital infrastructure.

<div align="center">
  <table width="100%">
    <tr>
      <td width="30%" align="center" valign="middle">
        <a href="https://www.digiformation.co.uk/">
          <img src="assets/digiformation-logo-black.png" alt="DIGIFORMATION LTD Logo" width="160" />
        </a>
        <br /><br />
        <strong>DIGIFORMATION LTD</strong>
        <br />
        <sub>Company # 16994903</sub>
      </td>
      <td valign="middle">
        🌐 <strong>Corporate Website:</strong> <a href="https://www.digiformation.co.uk/">https://www.digiformation.co.uk/</a><br />
        🏢 <strong>UK Company Registry:</strong> Company # 16994903 (England & Wales)<br />
        💬 <strong>WhatsApp Hotline:</strong> <a href="https://wa.me/923164467464">+92 316 4467464 (03164467464)</a><br />
        📧 <strong>Official Email:</strong> <a href="mailto:info@digiformation.co.uk">info@digiformation.co.uk</a> • <a href="mailto:info@digibizos.co.uk">info@digibizos.co.uk</a><br />
        📺 <strong>YouTube Channel:</strong> <a href="https://www.youtube.com/@Digiformationltd">@Digiformationltd</a> • <a href="https://www.youtube.com/@digibizos">@digibizos</a><br />
        🚀 <strong>Digi Biz OS Ecosystem:</strong> <a href="https://www.digibizos.co.uk/">https://www.digibizos.co.uk/</a><br />
        🌳 <strong>All Verified Channels:</strong> <a href="https://linktr.ee/digiformationltd">linktr.ee/digiformationltd</a>
      </td>
    </tr>
  </table>
</div>

---

## 📞 Official Contact & Support Directory

- **Primary WhatsApp Support Hotline:** [+92 316 4467464 (03164467464)](https://wa.me/923164467464?text=Hello%20DIGIFORMATION%20LTD%2C%20I%20am%20using%20DIGI%20LABS)
- **Official Corporate Emails:** [info@digiformation.co.uk](mailto:info@digiformation.co.uk) • [info@digibizos.co.uk](mailto:info@digibizos.co.uk)
- **Companies House UK Registry:** [Company # 16994903 (Official UK Government Registry)](https://find-and-update.company-information.service.gov.uk/company/16994903)
- **DIGIFORMATION LTD Corporate Website:** [https://www.digiformation.co.uk/](https://www.digiformation.co.uk/)
- **Digi Biz OS Web Portal & Docs:** [https://www.digibizos.co.uk/open-source/digi-labs](https://www.digibizos.co.uk/open-source/digi-labs)
- **Official Linktree (All Verified Channels):** [https://linktr.ee/digiformationltd](https://linktr.ee/digiformationltd)
- **Bug Reports & Feature Requests:** Feel free to open an Issue or Pull Request on GitHub.

<p align="center">
  <sub>© 2026 DIGIFORMATION LTD. All Rights Reserved. Registered in England & Wales (Company # 16994903).</sub>
</p>
