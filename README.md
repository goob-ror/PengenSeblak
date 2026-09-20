# IndoMarket Terminal (Sectors Terminal)

A modern, high-fidelity market intelligence web application designed for the Indonesian stock market (IDX) with planned support for SGX and KLSE. Inspired by professional financial terminals, IndoMarket Terminal focuses on analytical depth, derived insights, and clean information density.

## Overview

IndoMarket Terminal consumes raw market data (currently using mock data; planned integration with the [Sectors REST API](https://docs.sectors.app/get-started/v2/overview)) and transforms it into actionable insights. 

**Core Philosophies:**
- **Analytical over Generic:** This is not just a stock price dashboard; it emphasizes custom financial scores, rankings, peer comparisons, and anomaly detection.
- **Bilingual UX:** The application is primarily written in Indonesian (Bahasa Indonesia) for localized context, while maintaining standard English financial terms where it benefits the professional user experience (UX).
- **No Automated Trading:** The platform provides *decision support*, not trade execution.

## Features & Functional Requirements

The application provides several layers of derived insights:

### 1. Macro & Sector Intelligence
- **Sector Health Index (SHI):** Ranks the health of sectors (0–100) based on aggregated growth, margin stability, and debt ratios.
- **Sector Divergence / Anomaly Detector:** Automatically detects and highlights companies whose metrics (e.g., P/E ratio, margins) significantly deviate from their sector's average.

### 2. Company & Peer Analysis
- **Head-to-Head Dominance Score:** Directly compares 2–5 selected peers to determine the market leader based on a custom weighted fundamental matrix.
- **Financial Safety & Distress Score:** Analyzes financial risk using models adapted from Altman Z-Score and Piotroski F-Score methodologies.

### 3. News & Sentiment Intelligence
- **Catalyst & Sentiment Classifier:** Categorizes news events and announcements as Positive, Neutral, or Negative, and maps their potential transmission impact on specific companies and broader sectors.

### 4. Decision Support & Screening
- **Multi-Factor Decision Matrix:** A rule-based screener that categorizes stocks into actionable classifications (e.g., *Undervalued Quality*, *Growth at Reasonable Price*, *High Dividend Trap Alert*).

## Project Architecture & Tech Stack

This project is built using modern web development standards:
- **Framework:** TanStack Start (React + Vite + Nitro)
- **Routing:** TanStack Router
- **Styling:** Tailwind CSS + Radix UI Primitives
- **Icons:** Lucide React
- **Language:** TypeScript

## Current Progress & Roadmap

- [x] **UI/UX Foundation:** Initial layout, color palette (deep graphite/charcoal with restrained cyan/teal accents), and responsive design.
- [x] **Navigation Setup:** Sidebar layout and mobile responsiveness.
- [x] **Component System:** Data tables, score badges, mini-charts, and insight labels built.
- [x] **Mock Data Engine:** Realistic mock data engine (`src/lib/market-data.ts`) to simulate calculations for SHI, Dominance Score, and anomalies.
- [x] **Localization:** Translated key menus and UI sections to Indonesian ("Ringkasan Pasar", "Terminal Emiten", etc.) while preserving technical terms for UX.
- [ ] **Sectors API Integration:** Connect to the live Sectors API.
- [ ] **Caching Layer:** Implement client-side caching to minimize frequent API calls during development, reserving live data fetching for production.
- [ ] **Export Feature:** Enable PDF/text export of insights for research reporting.

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```

*Note: The application currently uses realistic mock data for UI prototyping. API keys for Sectors API will be required once live integration is complete.*
