.PHONY: help install build test lint format clean package deploy

# Default target
.DEFAULT_GOAL := help

# Variables
VERSION ?= 1.0.0
NODE_ENV ?= production

# Colors
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m

help: ## Show this help message
	@echo "$(CYAN)Node2AI Build System$(NC)"
	@echo ""
	@echo "$(GREEN)Available commands:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-15s$(NC) %s\n", $$1, $$2}'
	@echo ""

install: ## Install dependencies
	@echo "$(GREEN)Installing dependencies...$(NC)"
	pnpm install --frozen-lockfile

build: ## Build all applications
	@echo "$(GREEN)Building applications...$(NC)"
	./scripts/build-all.sh $(VERSION)

build-fast: ## Fast build (skip tests)
	@echo "$(YELLOW)Fast build (skipping tests)...$(NC)"
	pnpm run build

test: ## Run all tests
	@echo "$(GREEN)Running tests...$(NC)"
	./scripts/run-tests.sh all

test-unit: ## Run unit tests only
	@echo "$(GREEN)Running unit tests...$(NC)"
	./scripts/run-tests.sh unit

test-integration: ## Run integration tests only
	@echo "$(GREEN)Running integration tests...$(NC)"
	./scripts/run-tests.sh integration

test-e2e: ## Run E2E tests only
	@echo "$(GREEN)Running E2E tests...$(NC)"
	./scripts/run-tests.sh e2e

test-coverage: ## Run tests with coverage
	@echo "$(GREEN)Running tests with coverage...$(NC)"
	./scripts/run-tests.sh all true

lint: ## Run linting
	@echo "$(GREEN)Running linter...$(NC)"
	pnpm run lint

lint-fix: ## Fix linting issues
	@echo "$(GREEN)Fixing linting issues...$(NC)"
	pnpm run lint:fix

format: ## Format code
	@echo "$(GREEN)Formatting code...$(NC)"
	pnpm run format

format-check: ## Check code formatting
	@echo "$(GREEN)Checking code format...$(NC)"
	pnpm run format:check

clean: ## Clean build artifacts
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	rm -rf dist/
	rm -rf apps/*/dist/
	rm -rf apps/*/.next/
	rm -rf packages/*/dist/
	rm -rf coverage/
	rm -rf node_modules/.cache/

clean-all: clean ## Clean everything including node_modules
	@echo "$(RED)Cleaning everything...$(NC)"
	rm -rf node_modules/
	rm -rf apps/*/node_modules/
	rm -rf packages/*/node_modules/

package: build ## Create distribution package
	@echo "$(GREEN)Creating distribution package...$(NC)"
	./scripts/package-enterprise.sh $(VERSION)

package-validate: ## Validate distribution package
	@echo "$(GREEN)Validating package...$(NC)"
	./scripts/validate-package.sh dist/enterprise/node2ai-enterprise-v$(VERSION)

package-test: package ## Create and test package
	@echo "$(GREEN)Testing package...$(NC)"
	./scripts/test-package.sh dist/enterprise/node2ai-enterprise-v$(VERSION)-*.tar.gz

docker-build: ## Build Docker images
	@echo "$(GREEN)Building Docker images...$(NC)"
	docker build -t node2ai/api:$(VERSION) -f apps/api/Dockerfile .
	docker build -t node2ai/web:$(VERSION) -f apps/web/Dockerfile .

docker-push: docker-build ## Build and push Docker images
	@echo "$(GREEN)Pushing Docker images...$(NC)"
	docker push node2ai/api:$(VERSION)
	docker push node2ai/web:$(VERSION)

dev: ## Start development servers
	@echo "$(GREEN)Starting development servers...$(NC)"
	pnpm run dev

dev-api: ## Start API development server
	@echo "$(GREEN)Starting API server...$(NC)"
	cd apps/api && pnpm run dev

dev-web: ## Start web development server
	@echo "$(GREEN)Starting web server...$(NC)"
	cd apps/web && pnpm run dev

start: ## Start production servers
	@echo "$(GREEN)Starting production servers...$(NC)"
	docker-compose -f deployments/docker/docker-compose.yml up -d

stop: ## Stop production servers
	@echo "$(YELLOW)Stopping production servers...$(NC)"
	docker-compose -f deployments/docker/docker-compose.yml down

restart: stop start ## Restart production servers

logs: ## View production logs
	docker-compose -f deployments/docker/docker-compose.yml logs -f

status: ## Check production status
	@echo "$(GREEN)Checking status...$(NC)"
	docker-compose -f deployments/docker/docker-compose.yml ps
	@echo ""
	./scripts/health-check.sh

backup: ## Create backup
	@echo "$(GREEN)Creating backup...$(NC)"
	cd deployments/docker && ../../scripts/backup.sh

restore: ## Restore from backup
	@echo "$(YELLOW)Restoring from backup...$(NC)"
	@read -p "Enter backup file path: " backup_file; \
	cd deployments/docker && ../../scripts/restore.sh $$backup_file

deploy-local: package ## Deploy locally for testing
	@echo "$(GREEN)Deploying locally...$(NC)"
	cd dist/enterprise/node2ai-enterprise-v$(VERSION) && \
	sudo ./scripts/install.sh

ci-test: ## Run CI tests
	@echo "$(GREEN)Running CI tests...$(NC)"
	./scripts/ci-test.sh

generate-license: ## Generate a license key
	@echo "$(GREEN)Generating license...$(NC)"
	cd packages/licensing && pnpm run cli generate

validate-license: ## Validate a license key
	@echo "$(GREEN)Validating license...$(NC)"
	@read -p "Enter license key: " license_key; \
	cd packages/licensing && pnpm run cli validate $$license_key

version: ## Display version information
	@echo "$(CYAN)Node2AI Version Information$(NC)"
	@echo ""
	@echo "Current Version: $(VERSION)"
	@echo "Node.js: $(shell node --version)"
	@echo "pnpm: $(shell pnpm --version)"
	@echo "Docker: $(shell docker --version | grep -oP '\d+\.\d+\.\d+')"
	@echo ""
	@if [ -f "VERSION" ]; then cat VERSION; fi
