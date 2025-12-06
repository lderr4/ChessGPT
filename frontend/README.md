# Chess Analytics Frontend

React + TypeScript + Vite frontend for the Chess Analytics platform.

## Development

### Install dependencies
```bash
npm install
```

### Run development server
```bash
npm run dev
```

### Build for production
```bash
npm run build
```

### Preview production build
```bash
npm run preview
```

## Features

- **Authentication**: Login and registration with JWT
- **Dashboard**: Overview of chess performance
- **Game Library**: Browse and filter all games
- **Game Viewer**: Interactive chess board with move-by-move analysis
- **Statistics**: Charts and visualizations
- **Opening Repertoire**: Track opening performance

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Recharts
- react-chessboard
- Zustand (state management)
- Axios (API client)

## Project Structure

```
src/
├── components/      # Reusable components
│   ├── Layout.tsx
│   └── ProtectedRoute.tsx
├── pages/          # Page components
│   ├── Dashboard.tsx
│   ├── Games.tsx
│   ├── GameViewer.tsx
│   ├── Statistics.tsx
│   ├── Openings.tsx
│   ├── Profile.tsx
│   ├── Login.tsx
│   └── Register.tsx
├── lib/           # Utilities
│   └── api.ts     # API client
├── store/         # State management
│   └── authStore.ts
├── App.tsx        # Main app component
├── main.tsx       # Entry point
└── index.css      # Global styles
```

## Environment Variables

Create a `.env` file:

```env
VITE_API_URL=http://localhost:8000
```

## API Integration

The frontend connects to the FastAPI backend. All API calls are in `src/lib/api.ts`.

### Authentication

JWT tokens are stored in localStorage and automatically included in API requests.

### State Management

Zustand is used for global state (auth, user data). Local component state is used for UI-specific data.

