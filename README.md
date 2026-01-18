# VigilOR - AI-Powered Surgical Safety Monitor

[![Built for NexHacks 2026](https://img.shields.io/badge/Built%20for-NexHacks%202026-blue)](https://nexhacks.org)
[![React](https://img.shields.io/badge/React-18.2.0-61dafb?logo=react)](https://reactjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4.0-38bdf8?logo=tailwind-css)](https://tailwindcss.com/)
[![Overshoot SDK](https://img.shields.io/badge/Overshoot-SDK-10b981)](https://overshoot.ai)

> **The AI that doesn't blink** - Real-time surgical instrument tracking to prevent retained surgical items and enhance patient safety.

Demo - https://youtu.be/kac0_l-eE4E?si=oi6uii7ri_S5dDIJ

## 🎯 Problem Statement

Retained surgical items (RSIs) are a critical patient safety issue in operating rooms worldwide:
- **1 in 5,500** surgical procedures results in a retained item
- **Average cost**: $200,000+ per incident in legal fees and additional care
- **Human error**: Traditional manual counting is prone to mistakes during high-stress surgeries

VigilOR uses cutting-edge computer vision AI to provide real-time monitoring of surgical instruments, dramatically reducing the risk of RSIs.

## ✨ Features

### 🎥 Dual Vision Systems
- **Live Camera Mode**: Real-time monitoring using operating room cameras
- **Video Upload Mode**: Analyze pre-recorded surgical footage for training and review

### 🎯 Intelligent Zone Detection
- **Calibration Interface**: Draw custom zones for instrument tray and surgical site
- **Real-time Tracking**: AI identifies and tracks instruments across defined zones
- **Zone-based Alerts**: Instant notifications when items move to/from the incision zone

### 🧠 Dual AI Architecture
- **Primary**: Overshoot SDK with Qwen3-VL-30B vision model for continuous real-time tracking
- **Validation**: Roboflow workflow for periodic verification and baseline/post-surgery scans
- **Hybrid Accuracy**: Combines streaming AI with snapshot validation for maximum reliability

### 📊 Advanced Analytics
- **Live Item Count**: Real-time tally of instruments in tray vs. incision zones
- **Event Logging**: Detailed timeline of all item movements
- **Session Metrics**: Comprehensive tracking of detections, alerts, and discrepancies
- **Export Capabilities**: Download session data in JSON or CSV format

### 🔒 Safety Features
- **Lock/Unlock Mechanism**: Prevent accidental session closure
- **Item-in-Patient Warnings**: Visual and auditory alerts when items remain in surgical site
- **Baseline Scanning**: Compare pre-surgery and post-surgery item counts
- **Discrepancy Detection**: Automatic identification of missing or extra items

### 🎨 CCTV-Style Interface
- **Professional Monitoring UI**: Designed to mimic security camera systems
- **Real-time Overlays**: Live item markers, zone boundaries, and status indicators
- **Timestamp Display**: Continuous date/time overlay for documentation
- **Status Indicators**: Clear visual feedback on system state and alerts

## 🏗️ Technology Stack

### Frontend
- **React 18.2**: Modern UI framework with hooks
- **Vite**: Lightning-fast build tool and dev server
- **Tailwind CSS**: Utility-first styling
- **Lucide React**: Beautiful iconography

### AI/ML
- **Overshoot SDK**: Real-time vision streaming with WebRTC
- **Qwen3-VL-30B**: State-of-the-art vision-language model
- **Roboflow**: Custom surgical instrument detection workflow
- **OpenCV.js**: Image enhancement and preprocessing

### Tracking & State Management
- **Custom Item Tracking**: Advanced algorithm for persistent object tracking
- **Zone Classification**: Real-time spatial analysis
- **LocalStorage**: Session persistence and metrics storage

## 🚀 Getting Started

### Prerequisites
```bash
Node.js >= 16.0.0
npm or yarn
```

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/vigilor.git
cd vigilor
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Create a `.env` file in the root directory:
```env
# Overshoot API (Real-time vision)
VITE_OVERSHOOT_API_KEY=your_overshoot_api_key
VITE_OVERSHOOT_BASE_URL=https://cluster1.overshoot.ai/api/v0.2

# Roboflow (Validation & scanning)
VITE_ROBOFLOW_API_KEY=your_roboflow_api_key
VITE_ROBOFLOW_WORKSPACE=your_workspace_name
VITE_ROBOFLOW_WORKFLOW_ID=your_workflow_id
```

4. **Start the development server**
```bash
npm run dev
```

5. **Open your browser**
```
http://localhost:5173
```

### Building for Production
```bash
npm run build
```

The built files will be in the `dist/` directory.

## 📖 Usage Guide

### 1️⃣ Zone Calibration
1. Choose between **Live Camera** or **Upload Video**
2. Click **Draw Tray Zone** and draw a box around the instrument tray
3. Click **Draw Incision Zone** and draw a box around the surgical site
4. Click **Save & Continue** to proceed to monitoring

### 2️⃣ Live Monitoring
1. System automatically starts tracking instruments
2. Watch real-time counts in **Tray Zone** and **Incision Zone** panels
3. Items are color-coded:
   - 🟢 **Green**: Items in tray (safe)
   - 🔴 **Red**: Items in incision zone (requires attention)

### 3️⃣ Baseline & Post-Surgery Scans
1. Click **Capture Baseline Scan** before surgery begins
2. Perform surgical procedure while system monitors continuously
3. Click **Capture Post-Surgery Scan** when complete
4. Review discrepancy report for any missing/extra items

### 4️⃣ Session Management
1. Click the **Lock** icon to prevent accidental closure
2. System will warn if items remain in incision zone
3. Click **Close Session** when all items are accounted for
4. View/export metrics from the **Show Metrics** button

## 🎓 How It Works

### Real-time Tracking Pipeline
```
Camera Feed → Overshoot WebRTC → Qwen3-VL Model → 
Item Detection → Zone Classification → State Management → 
UI Update + Event Logging
```

### Validation Pipeline
```
Frame Capture → OpenCV Enhancement → Roboflow Detection → 
NMS Filtering → Zone Assignment → Count Comparison → 
Discrepancy Report
```

### Item Tracking Algorithm
- **Matching**: Associates new detections with existing tracked items using Euclidean distance
- **Zone Stability**: Requires multiple consecutive frames before zone change is confirmed
- **Merge Deduplication**: Eliminates duplicate detections of the same item
- **Stale Item Removal**: Removes items not seen for > 1 second
- **Event Generation**: Creates timeline entries for zone transitions

## 📊 Supported Instruments

Currently detects 6 common surgical instrument types:
- ✂️ Scissors
- 🔧 Retractors
- 🔨 Mallets
- 🏗️ Elevators
- 🤏 Forceps
- 💉 Syringes

*Note: The system filters out body parts (hands, fingers, gloves) to prevent false positives.*

## 🔮 Future Enhancements

- [ ] Multi-camera support for complete OR coverage
- [ ] Expanded instrument database (scalpels, needles, sponges)
- [ ] Integration with hospital EMR systems
- [ ] Voice alerts for hands-free notifications
- [ ] Mobile app for remote monitoring
- [ ] Historical analytics dashboard
- [ ] Compliance reporting for accreditation
- [ ] Multi-language support


## 🏆 NexHacks 2026

Built with ❤️ for NexHacks 2026


## 🙏 Acknowledgments

- **Overshoot AI** for the real-time vision SDK
- **Roboflow** for the surgical instrument detection workflow
- **OpenCV** for image processing capabilities
