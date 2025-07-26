# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Orange Meets is a WebRTC video conferencing application built with Remix and deployed on Cloudflare Workers. It uses Cloudflare Calls for WebRTC functionality and includes AI integration via OpenAI's Realtime API.

## Essential Commands

### Development
- `npm run dev` - Start development server (runs Remix dev + Wrangler dev)
- `npm start` - Start Wrangler dev server directly
- `npm run build` - Build the application for production
- `npm run clean` - Clean build directories

### Testing & Quality
- `npm run test` - Run unit tests with Vitest
- `npm run test:ci` - Run tests once (CI mode)
- `npm run test:e2e` - Run Playwright end-to-end tests
- `npm run typecheck` - Run TypeScript type checking
- `npm run lint` - Run ESLint and Prettier checks
- `npm run check` - Run all quality checks (lint + typecheck + test:ci)

### Database Operations
- `npm run db:generate` - Generate Drizzle schema migrations
- `npm run db:migrate:local` - Apply migrations to local D1 database
- `npm run db:migrate:development` - Apply migrations to development environment
- `npm run db:studio:local` - Open Drizzle Studio for local database

### Deployment
- `npm run deploy` - Full deployment pipeline (test + build + deploy to Cloudflare)

## Architecture

### Core Technologies
- **Frontend**: Remix (React framework) with TypeScript
- **Backend**: Cloudflare Workers with Durable Objects
- **Database**: Cloudflare D1 (SQLite) with Drizzle ORM
- **WebRTC**: Cloudflare Calls API via PartyTracks library
- **Real-time Communication**: WebSockets through PartyServer
- **AI Integration**: OpenAI Realtime API for voice interactions

### Key Architectural Components

#### Durable Objects
- `ChatRoom` (`app/durableObjects/ChatRoom.server.ts`): Central coordinator for each meeting room
  - Manages user connections and state
  - Handles WebSocket messaging between participants
  - Coordinates WebRTC signaling through Cloudflare Calls
  - Manages AI session integration
  - Implements user cleanup and meeting lifecycle

#### WebRTC Integration
- Uses PartyTracks library (`partytracks`) for WebRTC abstraction
- Cloudflare Calls handles signaling and media relay
- `usePeerConnection` hook manages connection state
- Audio/video tracks managed through Cloudflare Calls API

#### Real-time State Management
- WebSocket connections managed by PartyServer
- User state synchronized through Durable Object storage
- Observable patterns using RxJS for reactive updates
- Heartbeat mechanism for connection health monitoring

#### Database Schema
- `Meetings` table tracks meeting metadata and peak user counts
- `AnalyticsRefreshes` and `AnalyticsSimpleCallFeedback` for analytics
- Uses Drizzle ORM with migrations in `migrations/` directory

### Route Structure
- `/_index.tsx` - Landing page for creating new meetings
- `/_room.tsx` - Room layout wrapper
- `/_room.$roomName._index.tsx` - Pre-meeting lobby
- `/_room.$roomName.room.tsx` - Active meeting interface
- `parties.rooms.$roomName.$.tsx` - Durable Object WebSocket handler

### Component Architecture
- Radix UI components for accessibility
- Custom hooks for media management (`useUserMedia`, `useRoom`)
- Audio/video components (`SelfView`, `Participant`, `AudioIndicator`)
- Settings and controls (`MicButton`, `CameraButton`, `ScreenshareButton`)

## Environment Configuration

### Required Variables
- `CALLS_APP_ID` - Cloudflare Calls application ID
- `CALLS_APP_SECRET` - Cloudflare Calls secret (set via `wrangler secret put`)

### Optional Variables
- `TURN_SERVICE_ID` - Cloudflare TURN service ID
- `TURN_SERVICE_TOKEN` - TURN service token (secret)
- `OPENAI_MODEL_ENDPOINT` - OpenAI Realtime API endpoint
- `OPENAI_API_TOKEN` - OpenAI API token (secret)
- `MAX_WEBCAM_BITRATE` (default: 1200000)
- `MAX_WEBCAM_FRAMERATE` (default: 24)
- `MAX_WEBCAM_QUALITY_LEVEL` (default: 1080)

### Configuration Files
- `.dev.vars` - Local development environment variables
- `wrangler.toml` - Production configuration
- `wrangler.development.toml`, `wrangler.staging.toml` - Environment-specific configs

## Testing Strategy

### Unit Tests
- Vitest configuration in `vitest.config.mts`
- Tests excluded from `e2e-tests/` directory
- Uses MSW for API mocking (`app/mocks/`)

### E2E Tests
- Playwright tests in `e2e-tests/`
- Run with `npm run test:e2e`
- Configured in `playwright.config.ts`

### Quality Checks
- TypeScript strict mode enabled
- ESLint with Remix configuration
- Prettier for code formatting
- `npm run check` runs all quality gates

## AI Integration

The application supports real-time AI voice interaction using OpenAI's Realtime API:
- AI participants join as virtual users in meetings
- Voice-to-voice communication with low latency
- Push-to-talk controls for AI interaction
- WebRTC connection between Cloudflare Calls and OpenAI

## Development Notes

- Uses Remix manual mode with Wrangler for local development
- Hot reload configured through Wrangler dev proxy
- Path alias `~` maps to `./app` directory
- Build outputs to `build/` and `public/build/`
- Uses Tailwind CSS for styling with custom components