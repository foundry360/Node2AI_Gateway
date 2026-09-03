package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// AIInteraction represents an immutable audit record of an AI interaction
type AIInteraction struct {
	RequestID       string    `json:"requestId"`
	Timestamp       string    `json:"timestamp"`
	Organization    string    `json:"organization"`
	UserID          string    `json:"userId"`
	InputHash       string    `json:"inputHash"`       // SHA256 of original input
	SanitizedHash   string    `json:"sanitizedHash"`   // SHA256 of sanitized input
	PHIDetected     []string  `json:"phiDetected"`     // Types: PERSON, MRN, DATE, etc.
	PHIExposed      bool      `json:"phiExposed"`      // Always false
	AIProvider      string    `json:"aiProvider"`      // openai, anthropic, google
	Model           string    `json:"model"`           // gpt-4, claude-sonnet-4-5
	TokensUsed      int       `json:"tokensUsed"`
	CostUSD         float64   `json:"costUsd"`
	HIPAACompliant  bool      `json:"hipaaCompliant"`
	ProcessingTime  int       `json:"processingTimeMs"`
	CreatedAt       time.Time `json:"createdAt"`
}

// AuditTrailContract provides functions for managing audit trails
type AuditTrailContract struct {
	contractapi.Contract
}

// HistoryEntry represents a single entry in an interaction's history
type HistoryEntry struct {
	TxID      string    `json:"txId"`
	Timestamp time.Time `json:"timestamp"`
	IsDelete  bool      `json:"isDelete"`
	Value     AIInteraction `json:"value"`
}

// InitLedger initializes the ledger with default values (optional)
func (s *AuditTrailContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	log.Println("Initializing audit trail ledger")
	return nil
}

// RecordInteraction stores a new AI interaction on the blockchain
func (s *AuditTrailContract) RecordInteraction(ctx contractapi.TransactionContextInterface, requestId string, interactionJSON string) error {
	log.Printf("Recording interaction: %s", requestId)

	// Parse the interaction JSON
	var interaction AIInteraction
	err := json.Unmarshal([]byte(interactionJSON), &interaction)
	if (err != nil) {
		return fmt.Errorf("failed to unmarshal interaction: %v", err)
	}

	// Set the request ID from parameter
	interaction.RequestID = requestId
	
	// CreatedAt should come from the client in the JSON to ensure consensus
	// Do NOT set it here or each peer will generate a different value
	// If not provided, parse from timestamp string or use current time as last resort
	if interaction.CreatedAt.IsZero() {
		if interaction.Timestamp != "" {
			// Parse timestamp string to time.Time
			createdAt, err := time.Parse(time.RFC3339, interaction.Timestamp)
			if err == nil {
				interaction.CreatedAt = createdAt
			} else {
				// If timestamp parsing fails, use current time (should rarely happen)
				// Note: This could cause consensus issues if peers are far out of sync
				interaction.CreatedAt = time.Now()
				log.Printf("Warning: Failed to parse timestamp '%s', using current time", interaction.Timestamp)
			}
		} else {
			// No timestamp provided, use current time (should rarely happen)
			interaction.CreatedAt = time.Now()
		}
	}
	
	// Set timestamp from CreatedAt if not already set
	if interaction.Timestamp == "" {
		interaction.Timestamp = interaction.CreatedAt.Format(time.RFC3339)
	}

	// Validate required fields
	if interaction.InputHash == "" || interaction.SanitizedHash == "" {
		return fmt.Errorf("inputHash and sanitizedHash are required")
	}

	// Verify PHI was not exposed
	if interaction.PHIExposed {
		return fmt.Errorf("PHI exposure violation: PHI cannot be exposed to AI providers")
	}

	// Store interaction
	interactionBytes, err := json.Marshal(interaction)
	if (err != nil) {
		return fmt.Errorf("failed to marshal interaction: %v", err)
	}

	err = ctx.GetStub().PutState(requestId, interactionBytes)
	if (err != nil) {
		return fmt.Errorf("failed to put interaction: %v", err)
	}

	log.Printf("Successfully recorded interaction: %s", requestId)
	return nil
}

// QueryInteraction retrieves a specific interaction by requestId
func (s *AuditTrailContract) QueryInteraction(ctx contractapi.TransactionContextInterface, requestId string) (*AIInteraction, error) {
	log.Printf("Querying interaction: %s", requestId)

	interactionBytes, err := ctx.GetStub().GetState(requestId)
	if (err != nil) {
		return nil, fmt.Errorf("failed to read interaction: %v", err)
	}

	if (interactionBytes == nil) {
		return nil, fmt.Errorf("interaction not found: %s", requestId)
	}

	var interaction AIInteraction
	err = json.Unmarshal(interactionBytes, &interaction)
	if (err != nil) {
		return nil, fmt.Errorf("failed to unmarshal interaction: %v", err)
	}

	return &interaction, nil
}

// QueryInteractionsByOrganization retrieves all interactions for a specific organization
func (s *AuditTrailContract) QueryInteractionsByOrganization(ctx contractapi.TransactionContextInterface, orgId string) ([]*AIInteraction, error) {
	log.Printf("Querying interactions for organization: %s", orgId)

	// Create query string
	queryString := fmt.Sprintf(`{"selector":{"organization":"%s"}}`, orgId)

	resultsIterator, err := ctx.GetStub().GetQueryResult(queryString)
	if (err != nil) {
		return nil, fmt.Errorf("failed to get query result: %v", err)
	}
	defer resultsIterator.Close()

	var interactions []*AIInteraction
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if (err != nil) {
			return nil, fmt.Errorf("failed to get next query result: %v", err)
		}

		var interaction AIInteraction
		err = json.Unmarshal(queryResponse.Value, &interaction)
		if (err != nil) {
			return nil, fmt.Errorf("failed to unmarshal interaction: %v", err)
		}

		interactions = append(interactions, &interaction)
	}

	log.Printf("Found %d interactions for organization %s", len(interactions), orgId)
	return interactions, nil
}

// QueryInteractionsByDateRange retrieves interactions within a date range
func (s *AuditTrailContract) QueryInteractionsByDateRange(ctx contractapi.TransactionContextInterface, startDate string, endDate string) ([]*AIInteraction, error) {
	log.Printf("Querying interactions from %s to %s", startDate, endDate)

	// Parse dates
	start, err := time.Parse(time.RFC3339, startDate)
	if (err != nil) {
		return nil, fmt.Errorf("invalid start date format: %v", err)
	}

	end, err := time.Parse(time.RFC3339, endDate)
	if (err != nil) {
		return nil, fmt.Errorf("invalid end date format: %v", err)
	}

	// Create query string
	queryString := fmt.Sprintf(`{"selector":{"timestamp":{"$gte":"%s","$lte":"%s"}}}`, startDate, endDate)

	resultsIterator, err := ctx.GetStub().GetQueryResult(queryString)
	if (err != nil) {
		return nil, fmt.Errorf("failed to get query result: %v", err)
	}
	defer resultsIterator.Close()

	var interactions []*AIInteraction
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if (err != nil) {
			return nil, fmt.Errorf("failed to get next query result: %v", err)
		}

		var interaction AIInteraction
		err = json.Unmarshal(queryResponse.Value, &interaction)
		if (err != nil) {
			return nil, fmt.Errorf("failed to unmarshal interaction: %v", err)
		}

		// Additional client-side filtering for precise date range
		interactionTime, err := time.Parse(time.RFC3339, interaction.Timestamp)
		if (err == nil && interactionTime.After(start.Add(-time.Second)) && interactionTime.Before(end.Add(time.Second))) {
			interactions = append(interactions, &interaction)
		}
	}

	log.Printf("Found %d interactions in date range", len(interactions))
	return interactions, nil
}

// GetInteractionHistory returns the full history of changes to an interaction
func (s *AuditTrailContract) GetInteractionHistory(ctx contractapi.TransactionContextInterface, requestId string) ([]HistoryEntry, error) {
	log.Printf("Getting history for interaction: %s", requestId)

	historyIterator, err := ctx.GetStub().GetHistoryForKey(requestId)
	if (err != nil) {
		return nil, fmt.Errorf("failed to get history: %v", err)
	}
	defer historyIterator.Close()

	var history []HistoryEntry
	for historyIterator.HasNext() {
		historyResponse, err := historyIterator.Next()
		if (err != nil) {
			return nil, fmt.Errorf("failed to get next history entry: %v", err)
		}

		var interaction AIInteraction
		if historyResponse.Value != nil {
			err = json.Unmarshal(historyResponse.Value, &interaction)
			if (err != nil) {
				return nil, fmt.Errorf("failed to unmarshal interaction: %v", err)
			}
		}

		historyEntry := HistoryEntry{
			TxID:      historyResponse.TxId,
			Timestamp: time.Unix(historyResponse.Timestamp.Seconds, int64(historyResponse.Timestamp.Nanos)),
			IsDelete:  historyResponse.IsDelete,
			Value:     interaction,
		}

		history = append(history, historyEntry)
	}

	log.Printf("Found %d history entries for interaction %s", len(history), requestId)
	return history, nil
}

// ComplianceResult represents the result of a PHI compliance check
type ComplianceResult struct {
	IsCompliant bool   `json:"isCompliant"`
	Message     string `json:"message"`
}

// VerifyPHICompliance checks if PHI was properly sanitized by comparing hashes
func (s *AuditTrailContract) VerifyPHICompliance(ctx contractapi.TransactionContextInterface, requestId string) (*ComplianceResult, error) {
	log.Printf("Verifying PHI compliance for interaction: %s", requestId)

	interaction, err := s.QueryInteraction(ctx, requestId)
	if (err != nil) {
		return nil, fmt.Errorf("failed to query interaction: %v", err)
	}

	// Check if hashes differ (proving sanitization occurred)
	if interaction.InputHash != interaction.SanitizedHash {
		return &ComplianceResult{IsCompliant: true, Message: "PASS: Input was sanitized before sending to AI provider"}, nil
	}

	// If hashes are identical, check if PHI was detected
	if len(interaction.PHIDetected) > 0 {
		return &ComplianceResult{IsCompliant: false, Message: "FAIL: PHI detected but not sanitized (hashes identical)"}, nil
	}

	return &ComplianceResult{IsCompliant: true, Message: "PASS: No PHI detected in input"}, nil
}

func main() {
	contract, err := contractapi.NewChaincode(&AuditTrailContract{})
	if (err != nil) {
		log.Panicf("Error creating audit trail chaincode: %v", err)
	}

	if err := contract.Start(); err != nil {
		log.Panicf("Error starting audit trail chaincode: %v", err)
	}
}

