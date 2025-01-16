# Weather Analytics Dashboard 🌤️

A powerful tool for analyzing and visualizing weather data patterns and trends.

## Getting Started

### Prerequisites

- Python 3.8+
- pip package manager
- Git
- Virtual environment tool (conda or venv)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd weather-analytics-dashboard
   ```

2. Create and activate a virtual environment:

   ```bash
   # Using venv
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   
   # Or using conda
   conda create -n weather-env python=3.8
   conda activate weather-env
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Set up environment variables:

   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configurations
   ```

### Project Structure

```
weather-analytics-dashboard/
├── data/                    # Data storage directory
│   ├── raw/                # Raw data files
│   ├── processed/          # Processed data files
│   └── .gitignore         # Ignore data files
├── notebooks/              # Jupyter notebooks
│   ├── 01_data_collection.ipynb
│   ├── 02_data_processing.ipynb
│   └── 03_analysis.ipynb
├── src/                    # Source code
│   ├── data/              # Data processing scripts
│   ├── visualization/     # Visualization utilities
│   └── utils/            # Helper functions
├── tests/                 # Unit tests
├── .env.example          # Template for environment variables
├── requirements.txt      # Project dependencies
└── README.md            # Project documentation
```

### Best Practices

- Always use the virtual environment when working on the project
- Don't commit sensitive data or API keys
- Run notebooks in order (01 → 02 → 03)
- Save intermediate results in the data/ directory

### Data Storage

- Raw data is stored in `data/raw/`
- Processed data is saved in `data/processed/`
- Both Parquet and CSV formats are maintained for compatibility

## Development

### Code Style

- Follow PEP 8 guidelines
- Use type hints where possible
- Document functions and classes

### Testing

```bash
pytest tests/
```

### Contributing

1. Create a new branch for your feature
2. Follow the code style guidelines
3. Write tests for new functionality
4. Submit a pull request

