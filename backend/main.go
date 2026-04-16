package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/rs/cors"
)

// ─── Data Models ─────────────────────────────────────────────────────────────

type Team struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Budget int64    `json:"budget"`
	Roster []string `json:"roster"`
}

type SetConfigRequest struct {
	ImagePath string   `json:"imagePath"`
	Teams     []string `json:"teams"`
	BasePurse int64    `json:"basePurse"`
}

type BidRequest struct {
	TeamID string `json:"teamId"`
	KekaID string `json:"kekaId"`
	Amount int64  `json:"amount"`
}

type BidHistoryEntry struct {
	TeamID string `json:"teamId"`
	KekaID string `json:"kekaId"`
	Amount int64  `json:"amount"`
}

// ─── In-Memory State ──────────────────────────────────────────────────────────

var (
	mu          sync.RWMutex
	teams       = make(map[string]*Team)
	teamOrder   []string // preserve insertion order
	bidHistory  []BidHistoryEntry
	imageServer http.Handler
	imageMux    = http.NewServeMux()
	imageMount  bool
)

// ─── Handlers ─────────────────────────────────────────────────────────────────

func setConfigHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SetConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad Request: "+err.Error(), http.StatusBadRequest)
		return
	}

	mu.Lock()
	defer mu.Unlock()

	// Reset state
	teams = make(map[string]*Team)
	teamOrder = []string{}
	bidHistory = []BidHistoryEntry{}

	// Initialize teams
	for i, name := range req.Teams {
		id := fmt.Sprintf("t%d", i+1)
		teams[id] = &Team{
			ID:     id,
			Name:   name,
			Budget: req.BasePurse,
			Roster: []string{},
		}
		teamOrder = append(teamOrder, id)
	}

	// Mount image file server
	if req.ImagePath != "" {
		imageServer = http.StripPrefix("/images/", http.FileServer(http.Dir(req.ImagePath)))
		imageMount = true
		log.Printf("Mounted image server at: %s", req.ImagePath)
	}

	log.Printf("Config set: %d teams, purse %d, imagePath: %s", len(req.Teams), req.BasePurse, req.ImagePath)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func teamsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	mu.RLock()
	defer mu.RUnlock()

	result := make([]*Team, 0, len(teamOrder))
	for _, id := range teamOrder {
		result = append(result, teams[id])
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func bidHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var req BidRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad Request: "+err.Error(), http.StatusBadRequest)
		return
	}

	mu.Lock()
	defer mu.Unlock()

	team, exists := teams[req.TeamID]
	if !exists {
		http.Error(w, "Team not found", http.StatusNotFound)
		return
	}

	if team.Budget < req.Amount {
		http.Error(w, "Insufficient budget", http.StatusForbidden)
		return
	}

	team.Budget -= req.Amount
	team.Roster = append(team.Roster, req.KekaID)
	bidHistory = append(bidHistory, BidHistoryEntry{
		TeamID: req.TeamID,
		KekaID: req.KekaID,
		Amount: req.Amount,
	})

	log.Printf("BID: Team %s bought %s for %d. Remaining: %d", team.Name, req.KekaID, req.Amount, team.Budget)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":          "ok",
		"remainingBudget": team.Budget,
	})
}

func reverseBidHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	mu.Lock()
	defer mu.Unlock()

	if len(bidHistory) == 0 {
		http.Error(w, "No previous bid to reverse", http.StatusConflict)
		return
	}

	lastBid := bidHistory[len(bidHistory)-1]
	team, exists := teams[lastBid.TeamID]
	if !exists {
		http.Error(w, "Team not found", http.StatusNotFound)
		return
	}

	if team.Budget+lastBid.Amount < 0 {
		http.Error(w, "Invalid bid reversal", http.StatusConflict)
		return
	}

	team.Budget += lastBid.Amount
	if len(team.Roster) > 0 && team.Roster[len(team.Roster)-1] == lastBid.KekaID {
		team.Roster = team.Roster[:len(team.Roster)-1]
	} else {
		for i := len(team.Roster) - 1; i >= 0; i-- {
			if team.Roster[i] == lastBid.KekaID {
				team.Roster = append(team.Roster[:i], team.Roster[i+1:]...)
				break
			}
		}
	}
	bidHistory = bidHistory[:len(bidHistory)-1]

	log.Printf("REVERSE BID: Team %s refunded %s for %d. New budget: %d", team.Name, lastBid.KekaID, lastBid.Amount, team.Budget)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":          "ok",
		"teamId":          lastBid.TeamID,
		"kekaId":          lastBid.KekaID,
		"amount":          lastBid.Amount,
		"remainingBudget": team.Budget,
	})
}

func imageProxyHandler(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	mounted := imageMount
	handler := imageServer
	mu.RUnlock()

	if !mounted || handler == nil {
		http.Error(w, "Image server not configured", http.StatusServiceUnavailable)
		return
	}
	handler.ServeHTTP(w, r)
}

// ─── Main ──────────────────────────────────────────────────────────────────────

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/set-config", setConfigHandler)
	mux.HandleFunc("/api/teams", teamsHandler)
	mux.HandleFunc("/api/bid", bidHandler)
	mux.HandleFunc("/api/reverse-bid", reverseBidHandler)
	mux.HandleFunc("/images/", imageProxyHandler)

	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
	})

	handler := c.Handler(mux)

	log.Println("🏏 Cricket Auction Server running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", handler))
}
