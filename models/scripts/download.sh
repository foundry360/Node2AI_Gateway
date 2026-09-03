#!/bin/bash

# SupernovaAI Model Download Script
# This script downloads AI models for air-gapped deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MODELS_DIR="./offline"
CACHE_DIR="./cache"
SCRIPTS_DIR="$(dirname "$0")"

# Model repositories
HUGGINGFACE_REPO="https://huggingface.co"
OLLAMA_MODELS="https://ollama.ai/library"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create directories
create_directories() {
    log_info "Creating model directories..."
    mkdir -p "$MODELS_DIR"/{text-generation,embeddings,specialized,config}
    mkdir -p "$CACHE_DIR"
    log_success "Directories created"
}

# Download model from Hugging Face
download_huggingface() {
    local model_name=$1
    local output_dir=$2
    
    log_info "Downloading $model_name from Hugging Face..."
    
    # Use git-lfs if available, otherwise use wget/curl
    if command -v git-lfs &> /dev/null; then
        git clone "https://huggingface.co/$model_name" "$output_dir"
        log_success "Downloaded $model_name"
    else
        log_warning "git-lfs not found. Using alternative download method..."
        # Download individual files
        local base_url="https://huggingface.co/$model_name/resolve/main"
        
        # Download model files
        for file in "pytorch_model.bin" "model.safetensors" "config.json" "tokenizer.json"; do
            if curl -f -L "$base_url/$file" -o "$output_dir/$file" 2>/dev/null; then
                log_success "Downloaded $file"
            else
                log_warning "Failed to download $file"
            fi
        done
    fi
}

# Download model from Ollama
download_ollama() {
    local model_name=$1
    local output_dir=$2
    
    log_info "Downloading $model_name from Ollama..."
    
    # Use ollama pull if available
    if command -v ollama &> /dev/null; then
        ollama pull "$model_name"
        log_success "Downloaded $model_name via Ollama"
    else
        log_warning "Ollama not found. Please install Ollama or use alternative download method."
        return 1
    fi
}

# Download recommended models
download_recommended() {
    log_info "Downloading recommended models..."
    
    # Text generation models
    local text_models=(
        "microsoft/DialoGPT-medium"
        "microsoft/DialoGPT-large"
        "facebook/blenderbot-400M-distill"
        "facebook/blenderbot-1B-distill"
    )
    
    for model in "${text_models[@]}"; do
        local model_dir="$MODELS_DIR/text-generation/$(basename "$model")"
        download_huggingface "$model" "$model_dir"
    done
    
    # Embedding models
    local embedding_models=(
        "sentence-transformers/all-MiniLM-L6-v2"
        "sentence-transformers/all-mpnet-base-v2"
        "sentence-transformers/all-roberta-large-v1"
    )
    
    for model in "${embedding_models[@]}"; do
        local model_dir="$MODELS_DIR/embeddings/$(basename "$model")"
        download_huggingface "$model" "$model_dir"
    done
    
    # Specialized models
    local specialized_models=(
        "microsoft/DialoGPT-medium"
        "microsoft/DialoGPT-large"
    )
    
    for model in "${specialized_models[@]}"; do
        local model_dir="$MODELS_DIR/specialized/$(basename "$model")"
        download_huggingface "$model" "$model_dir"
    done
    
    log_success "All recommended models downloaded"
}

# Download specific model
download_model() {
    local model_name=$1
    local model_type=${2:-"text-generation"}
    
    log_info "Downloading $model_name to $model_type..."
    
    local output_dir="$MODELS_DIR/$model_type/$(basename "$model_name")"
    
    # Determine download method based on model name
    if [[ "$model_name" == *"huggingface"* ]] || [[ "$model_name" == *"/"* ]]; then
        download_huggingface "$model_name" "$output_dir"
    else
        download_ollama "$model_name" "$output_dir"
    fi
}

# Download all models
download_all() {
    log_info "Downloading all available models..."
    
    # This would typically be a comprehensive list
    # For now, we'll download the recommended set
    download_recommended
}

# Validate downloaded models
validate_models() {
    log_info "Validating downloaded models..."
    
    local validation_failed=0
    
    # Check if models exist and have required files
    for model_dir in "$MODELS_DIR"/*/*; do
        if [ -d "$model_dir" ]; then
            local model_name=$(basename "$model_dir")
            local required_files=("config.json")
            
            local missing_files=()
            for file in "${required_files[@]}"; do
                if [ ! -f "$model_dir/$file" ]; then
                    missing_files+=("$file")
                fi
            done
            
            if [ ${#missing_files[@]} -eq 0 ]; then
                log_success "Model $model_name is valid"
            else
                log_error "Model $model_name is missing: ${missing_files[*]}"
                validation_failed=1
            fi
        fi
    done
    
    if [ $validation_failed -eq 0 ]; then
        log_success "All models validated successfully"
    else
        log_error "Some models failed validation"
        return 1
    fi
}

# Generate model configuration
generate_config() {
    log_info "Generating model configuration..."
    
    local config_file="$MODELS_DIR/config/models.yaml"
    
    cat > "$config_file" << EOF
# SupernovaAI Model Configuration
# Generated on $(date)

models:
EOF
    
    # Generate configuration for each model
    for model_dir in "$MODELS_DIR"/*/*; do
        if [ -d "$model_dir" ]; then
            local model_name=$(basename "$model_dir")
            local model_type=$(basename "$(dirname "$model_dir")")
            
            cat >> "$config_file" << EOF
  $model_name:
    path: "$model_dir"
    type: "$model_type"
    enabled: true
    priority: 1
EOF
        fi
    done
    
    log_success "Model configuration generated: $config_file"
}

# Show download summary
show_summary() {
    log_success "Model download completed!"
    echo
    echo "Download Summary:"
    echo "  Models Directory: $MODELS_DIR"
    echo "  Cache Directory: $CACHE_DIR"
    echo
    
    # Count models by type
    local text_count=$(find "$MODELS_DIR/text-generation" -type d -mindepth 1 | wc -l)
    local embedding_count=$(find "$MODELS_DIR/embeddings" -type d -mindepth 1 | wc -l)
    local specialized_count=$(find "$MODELS_DIR/specialized" -type d -mindepth 1 | wc -l)
    
    echo "Downloaded Models:"
    echo "  Text Generation: $text_count"
    echo "  Embeddings: $embedding_count"
    echo "  Specialized: $specialized_count"
    echo
    
    echo "Next Steps:"
    echo "  1. Validate models: ./scripts/validate.sh"
    echo "  2. Convert formats: ./scripts/convert.sh"
    echo "  3. Test models: ./scripts/test.sh"
    echo "  4. Configure SupernovaAI to use offline models"
    echo
}

# Main function
main() {
    case "${1:-help}" in
        "recommended")
            create_directories
            download_recommended
            validate_models
            generate_config
            show_summary
            ;;
        "all")
            create_directories
            download_all
            validate_models
            generate_config
            show_summary
            ;;
        "model")
            if [ -z "$2" ]; then
                log_error "Model name not specified"
                echo "Usage: $0 model <model_name> [type]"
                exit 1
            fi
            create_directories
            download_model "$2" "$3"
            validate_models
            generate_config
            show_summary
            ;;
        "validate")
            validate_models
            ;;
        "config")
            generate_config
            ;;
        "help"|*)
            echo "SupernovaAI Model Download Script"
            echo
            echo "Usage: $0 {recommended|all|model|validate|config|help}"
            echo
            echo "Commands:"
            echo "  recommended  - Download recommended models"
            echo "  all         - Download all available models"
            echo "  model       - Download specific model"
            echo "  validate    - Validate downloaded models"
            echo "  config      - Generate model configuration"
            echo "  help        - Show this help message"
            echo
            echo "Examples:"
            echo "  $0 recommended"
            echo "  $0 model microsoft/DialoGPT-medium"
            echo "  $0 model llama-2-7b-chat text-generation"
            echo "  $0 validate"
            ;;
    esac
}

# Run main function
main "$@"
