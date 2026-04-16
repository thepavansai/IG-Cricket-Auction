# Cricket Auction Platform 🏏

A modern, zero-database cricket player auction platform with real-time bidding, dark & light mode support, and Excel-based player management.

## Features

✨ **Real-Time Bidding** - Live player auction dashboard  
🎨 **Dark & Light Mode** - Toggle between themes with WCAG-compliant contrast  
📊 **Excel Import** - Upload player rosters with structured metadata  
💰 **Budget Tracking** - Real-time team budget visualization  
📥 **Excel Export** - Generate auction reports with player stats  
🖼️ **Photo Support** - Display player photos during bidding  
⚡ **Zero Dependencies** - Go stdlib backend, minimal frontend bundle  

## Quick Start

### Prerequisites
- **Go 1.21+** - [Install](https://golang.org/doc/install)
- **Node.js 16+** - [Install](https://nodejs.org/)

### Running Locally

1. **Start the Go Backend**
```bash
cd backend
go mod tidy
go run main.go
```
Server runs on `http://localhost:8080`

2. **Start the React Frontend** (in a new terminal)
```bash
cd frontend
npm install
npm run dev
```
App runs on `http://localhost:5173`

3. **Open** `http://localhost:5173` in your browser

## Folder Structure

```
cricket-auction/
├── backend/
│   ├── main.go              ← Go API server
│   ├── go.mod
│   └── go.sum
├── frontend/
│   ├── src/
│   │   ├── views/           ← React view components
│   │   ├── App.jsx          ← Main app shell
│   │   ├── main.jsx         ← Entry point
│   │   └── index.css        ← Dark/Light theme styles
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
└── README.md
```

## API Reference

### POST `/api/set-config`
Initialize auction with teams and settings
```json
{
  "imagePath": "/path/to/photos",
  "teams": ["Hawks", "Bulls"],
  "basePurse": 100000
}
```

### GET `/api/teams`
Fetch current team data with budgets
```json
[{
  "id": "t1",
  "name": "Hawks",
  "budget": 85000,
  "roster": ["IG0227"]
}]
```

### POST `/api/bid`
Place a bid for a player
```json
{
  "teamId": "t1",
  "kekaId": "IG0227",
  "amount": 15000
}
```

### GET `/images/{filename}`
Stream player photos from configured directory

## Excel Column Requirements

Your player roster must have these columns:
- `KEKA ID` - Player identifier
- `FULL NAME` - Display name
- `Select your cricket category` - Player role (Batter, Bowler, etc.)
- `Select your SKILL level ` - Skill rating *(handles variations with/without trailing space)*
- `Email` - Player contact
- `PLEASE UPLOAD YOUR RECENT PHOTO FOR THE AUCTION PROCESS.` - Photo filename

## Theme System

The app supports **dark** (default) and **light** themes with proper color contrast ratios:

- **Dark Mode** - High contrast green/gold on dark backgrounds (WCAG AA+)
- **Light Mode** - Muted green/gold on light backgrounds (WCAG AA+)

Toggle via the theme button in the header. Preference is saved to browser localStorage.

## Building for Production

```bash
# Frontend
cd frontend
npm run build
# Output: dist/

# Backend
cd backend
go build -o cricket-auction ./...
```

## Development

### Hot Reload
- Frontend: Vite automatically hot-reloads on file changes
- Backend: Use [Air](https://github.com/air-verse/air) for Go hot-reload
  ```bash
  go install github.com/air-verse/air@latest
  cd backend && air
  ```

## License

MIT License - see LICENSE file

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `CORS errors` | Ensure Go backend is running on :8080 before opening React app |
| `Photos not loading` | Verify imagePath in setup matches your folder; check filenames match Excel |
| `Port already in use` | Kill process: `lsof -ti :8080 \| xargs kill -9` (backend) or `lsof -ti :5173 \| xargs kill -9` (frontend) |
| `Excel parse errors` | Re-save file as `.xlsx` in Excel to fix encoding issues |

---

Built with ❤️ for cricket enthusiasts.
