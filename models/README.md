# Node2AI Models Directory

This directory contains AI models for air-gapped deployment of Node2AI.

## Overview

For air-gapped deployments, Node2AI can run completely offline using local AI models. This directory stores the model files and configuration needed for offline operation.

## Supported Model Formats

- **GGUF**: Quantized models for efficient inference
- **Safetensors**: Safe tensor format for PyTorch models
- **ONNX**: Open Neural Network Exchange format
- **Hugging Face**: Compatible with Hugging Face transformers

## Model Categories

### Text Generation Models

- **Llama 2**: Meta's open-source language model
- **Code Llama**: Specialized for code generation
- **Mistral**: High-performance instruction-following model
- **Phi**: Microsoft's compact language model

### Embedding Models

- **sentence-transformers**: For semantic search
- **all-MiniLM-L6-v2**: Lightweight embedding model
- **all-mpnet-base-v2**: High-quality embedding model

### Specialized Models

- **CodeBERT**: For code understanding
- **ClinicalBERT**: For medical text processing
- **FinancialBERT**: For financial text analysis

## Directory Structure

```
models/
├── README.md                 # This file
├── offline/                  # Offline model storage
│   ├── text-generation/      # Text generation models
│   ├── embeddings/           # Embedding models
│   ├── specialized/          # Specialized models
│   └── config/               # Model configuration
├── cache/                    # Model cache (auto-generated)
└── scripts/                  # Model management scripts
    ├── download.sh           # Download models
    ├── convert.sh            # Convert model formats
    └── validate.sh           # Validate model integrity
```

## Model Management

### Downloading Models

```bash
# Download a specific model
./scripts/download.sh llama-2-7b-chat

# Download all recommended models
./scripts/download.sh --all

# Download models for specific use case
./scripts/download.sh --text-generation
./scripts/download.sh --embeddings
```

### Converting Models

```bash
# Convert to GGUF format for better performance
./scripts/convert.sh --input model.safetensors --output model.gguf

# Convert to ONNX for cross-platform compatibility
./scripts/convert.sh --input model.safetensors --output model.onnx
```

### Validating Models

```bash
# Validate model integrity
./scripts/validate.sh model.gguf

# Validate all models
./scripts/validate.sh --all
```

## Recommended Models

### For Text Generation

- **llama-2-7b-chat.gguf** (4.1GB) - General purpose chat
- **llama-2-13b-chat.gguf** (7.3GB) - Higher quality responses
- **mistral-7b-instruct.gguf** (4.1GB) - Instruction following
- **phi-2.gguf** (1.6GB) - Compact but capable

### For Embeddings

- **all-MiniLM-L6-v2** (22MB) - Fast embeddings
- **all-mpnet-base-v2** (420MB) - High quality embeddings
- **sentence-transformers/all-roberta-large-v1** (1.3GB) - Best quality

### For Code Generation

- **code-llama-7b-python.gguf** (4.1GB) - Python code generation
- **code-llama-13b-python.gguf** (7.3GB) - Advanced code generation

## Model Configuration

### Text Generation Models

```yaml
# models/config/text-generation.yaml
models:
  llama-2-7b-chat:
    path: 'offline/text-generation/llama-2-7b-chat.gguf'
    type: 'gguf'
    size: '7B'
    context_length: 4096
    temperature: 0.7
    top_p: 0.9
    max_tokens: 2048

  mistral-7b-instruct:
    path: 'offline/text-generation/mistral-7b-instruct.gguf'
    type: 'gguf'
    size: '7B'
    context_length: 8192
    temperature: 0.7
    top_p: 0.9
    max_tokens: 2048
```

### Embedding Models

```yaml
# models/config/embeddings.yaml
models:
  all-MiniLM-L6-v2:
    path: 'offline/embeddings/all-MiniLM-L6-v2'
    type: 'sentence-transformers'
    dimension: 384
    max_length: 256

  all-mpnet-base-v2:
    path: 'offline/embeddings/all-mpnet-base-v2'
    type: 'sentence-transformers'
    dimension: 768
    max_length: 512
```

## Performance Considerations

### Hardware Requirements

| Model Size | RAM Required | VRAM Required | CPU Cores |
| ---------- | ------------ | ------------- | --------- |
| 7B         | 8GB          | 4GB           | 4         |
| 13B        | 16GB         | 8GB           | 8         |
| 30B        | 32GB         | 16GB          | 16        |
| 70B        | 64GB         | 32GB          | 32        |

### Optimization Tips

1. **Use quantized models** (GGUF) for better performance
2. **Enable GPU acceleration** when available
3. **Adjust context length** based on use case
4. **Use model caching** for frequently accessed models
5. **Monitor memory usage** to prevent OOM errors

## Security Considerations

### Model Integrity

- All models are cryptographically verified
- Checksums are provided for each model
- Models are scanned for malicious content

### Data Privacy

- Models run completely offline
- No data is sent to external services
- All processing happens locally

### Access Control

- Models are stored in encrypted volumes
- Access is restricted to authorized users
- Audit logs track model usage

## Troubleshooting

### Common Issues

1. **Out of Memory**: Reduce model size or increase RAM
2. **Slow Performance**: Enable GPU acceleration or use smaller models
3. **Model Not Found**: Check file paths and permissions
4. **Corrupted Model**: Re-download and verify checksums

### Debug Commands

```bash
# Check model status
./scripts/validate.sh --verbose

# Monitor resource usage
docker stats supernova-ollama

# Check model logs
docker logs supernova-ollama

# Test model inference
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "llama-2-7b-chat", "prompt": "Hello, world!"}'
```

## License

Models in this directory are subject to their respective licenses:

- **Llama 2**: Meta License Agreement
- **Mistral**: Apache 2.0
- **Phi**: MIT License
- **Code Llama**: Meta License Agreement

Please review individual model licenses before use.

## Support

For model-related issues:

1. Check the troubleshooting section above
2. Review model documentation
3. Contact Node2AI support
4. Check community forums

## Updates

Models are updated periodically. To update:

1. Download new model versions
2. Update configuration files
3. Restart services
4. Verify functionality

For automatic updates, use the model management scripts with the `--update` flag.
